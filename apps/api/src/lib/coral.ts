import { spawn, type ChildProcess } from 'child_process';
import { env } from '../config/env.js';
import type { CoralQueryResult } from '@sre/types';

/**
 * Coral MCP client.
 *
 * By default spawns: coral mcp-stdio
 *
 * On Windows (Coral runs in WSL), set CORAL_BIN in .env:
 *   CORAL_BIN=wsl -d Ubuntu -e coral
 *
 * The env var is split on spaces to form [command, ...args], then
 * "mcp-stdio" is appended. e.g.:
 *   ["wsl", "-d", "Ubuntu", "-e", "coral", "mcp-stdio"]
 */

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface CoralSqlResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

function resolveCoralCommand(): { cmd: string; args: string[] } {
  const bin = process.env.CORAL_BIN?.trim();
  if (bin) {
    const parts = bin.split(/\s+/);
    return { cmd: parts[0], args: [...parts.slice(1), 'mcp-stdio'] };
  }
  return { cmd: 'coral', args: ['mcp-stdio'] };
}

class CoralClient {
  private process: ChildProcess | null = null;
  private buffer = '';
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private nextId = 1;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  get disabled(): boolean {
    return env.coralEnabled === false;
  }

  private sourceEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PAGERDUTY_API_TOKEN:   env.coral.pagerdutyToken,
      GRAFANA_URL:           env.coral.grafanaUrl,
      GRAFANA_TOKEN:         env.coral.grafanaToken,
      GITHUB_TOKEN:          env.coral.githubToken,
      STATUSGATOR_API_TOKEN: env.coral.statusgatorToken,
      ...(env.coralConfigDir ? { CORAL_CONFIG_DIR: env.coralConfigDir } : {}),
    };
  }

  connect(): Promise<void> {
    if (this.disabled) return Promise.resolve();
    if (this.initialized) return Promise.resolve();
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._connect().catch((err) => {
      this.initPromise = null;
      throw err;
    });
    return this.initPromise;
  }

  private async _connect(): Promise<void> {
    const { cmd, args } = resolveCoralCommand();

    await new Promise<void>((resolve, reject) => {
      let proc: ChildProcess;
      try {
        proc = spawn(cmd, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: this.sourceEnv(),
        });
      } catch (err) {
        reject(buildInstallError(cmd, err as Error));
        return;
      }

      this.process = proc;
      proc.stdout!.setEncoding('utf8');
      proc.stdout!.on('data', (chunk: string) => { this.buffer += chunk; this.flush(); });
      proc.stderr!.on('data', (chunk: Buffer) => {
        const msg = chunk.toString().trim();
        if (msg) console.error('[coral stderr]', msg);
      });
      proc.on('error', (err) => {
        reject(buildInstallError(cmd, err));
      });
      proc.on('exit', (code) => {
        if (!this.initialized) {
          reject(new Error(`Coral exited before initialisation (code ${code})`));
          return;
        }
        console.error('[coral] process exited with code', code);
        this.initialized = false;
        this.initPromise = null;
        const err = new Error(`Coral process exited (code ${code})`);
        for (const [id, handler] of this.pending) {
          clearTimeout(handler.timer);
          handler.reject(err);
          this.pending.delete(id);
        }
      });
      resolve();
    });

    await this.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'sre-investigator', version: '0.1.0' },
    });

    this.process!.stdin!.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n',
    );

    this.initialized = true;
    console.log('[coral] MCP connection established');
  }

  private flush(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse;
        if (msg.id == null) continue;
        const handler = this.pending.get(msg.id);
        if (!handler) continue;
        clearTimeout(handler.timer);
        this.pending.delete(msg.id);
        if (msg.error) handler.reject(new Error(msg.error.message));
        else handler.resolve(msg.result);
      } catch { /* non-JSON */ }
    }
  }

  private rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process) { reject(new Error('Coral process not started')); return; }
      const id = this.nextId++;
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Coral timeout: ${method} id=${id}`));
        }
      }, 45_000);
      this.pending.set(id, { resolve, reject, timer });
      this.process.stdin!.write(
        JSON.stringify({ jsonrpc: '2.0', id, method, params } as JsonRpcRequest) + '\n',
      );
    });
  }

  async query(sql: string): Promise<CoralQueryResult> {
    if (this.disabled) {
      console.warn('[coral] disabled — query skipped:', sql.trim().slice(0, 80));
      return { columns: [], rows: [], row_count: 0, execution_ms: 0 };
    }
    await this.connect();
    const start = Date.now();

    const result = (await this.rpc('tools/call', {
      name: 'sql',
      arguments: { sql },
    })) as CoralSqlResult;

    if (result.isError) {
      const msg = result.content.find((c) => c.type === 'text')?.text ?? 'Unknown error';
      throw new Error(`Coral SQL error: ${msg}`);
    }

    const text = result.content.find((c) => c.type === 'text')?.text ?? '[]';
    let rows: Record<string, unknown>[];
    try { rows = JSON.parse(text) as Record<string, unknown>[]; }
    catch { console.error('[coral] unexpected result:', text.slice(0, 200)); rows = []; }

    return {
      columns: rows.length > 0 ? Object.keys(rows[0]) : [],
      rows,
      row_count: rows.length,
      execution_ms: Date.now() - start,
    };
  }

  async listCatalog(schema?: string): Promise<Array<{ schema: string; table: string; kind: string }>> {
    if (this.disabled) return [];
    await this.connect();
    const result = (await this.rpc('tools/call', {
      name: 'list_catalog',
      arguments: { ...(schema ? { schema } : {}), limit: 200 },
    })) as CoralSqlResult;
    const text = result.content.find((c) => c.type === 'text')?.text ?? '[]';
    try { return JSON.parse(text) as Array<{ schema: string; table: string; kind: string }>; }
    catch { return []; }
  }

  disconnect(): void {
    this.process?.kill();
    this.initialized = false;
    this.initPromise = null;
  }
}

function buildInstallError(cmd: string, err: Error): Error {
  const isEnoent = err.message.includes('ENOENT') || err.message.includes('not recognized');
  if (!isEnoent) return err;

  const usingWsl = cmd === 'wsl';
  if (usingWsl) {
    return new Error(
      `WSL Coral call failed (ENOENT).\n` +
      `  1. Open Ubuntu in WSL: wsl -d Ubuntu\n` +
      `  2. Install Coral: curl -fsSL https://withcoral.com/install.sh | sh\n` +
      `  3. Verify: coral --version\n` +
      `  4. Check CORAL_BIN in .env matches your WSL distro name`
    );
  }

  return new Error(
    `Coral CLI not found.\n` +
    `  Windows (WSL): see README — set CORAL_BIN=wsl -d Ubuntu -e coral\n` +
    `  macOS  : brew install withcoral/tap/coral\n` +
    `  Linux  : curl -fsSL https://withcoral.com/install.sh | sh\n` +
    `  Or set CORAL_ENABLED=false to skip Coral in local dev.`
  );
}

export const coral = new CoralClient();

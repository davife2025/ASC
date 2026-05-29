import { spawn, type ChildProcess } from 'child_process';
import { env } from '../config/env.js';
import type { CoralQueryResult } from '@sre/types';

// Coral exposes sources as SQL schemas via coral mcp-stdio (JSON-RPC over stdio).
// Source credentials are passed as env vars — Coral reads them at query time.

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

class CoralClient {
  private process: ChildProcess | null = null;
  private buffer = '';
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private nextId = 1;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  // ─── Source env vars Coral reads at query time ──────────────────────────────
  private sourceEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PAGERDUTY_API_TOKEN: env.coral.pagerdutyToken,
      DD_API_KEY: env.coral.ddApiKey,
      DD_APPLICATION_KEY: env.coral.ddAppKey,
      DD_SITE: env.coral.ddSite,
      GITHUB_TOKEN: env.coral.githubToken,
      STATUSGATOR_API_TOKEN: env.coral.statusgatorToken,
    };
  }

  async connect(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._connect();
    return this.initPromise;
  }

  private async _connect(): Promise<void> {
    this.process = spawn('coral', ['mcp-stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: this.sourceEnv(),
    });

    this.process.stdout!.setEncoding('utf8');
    this.process.stdout!.on('data', (chunk: string) => {
      this.buffer += chunk;
      this.flush();
    });

    this.process.stderr!.on('data', (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) console.error('[coral stderr]', msg);
    });

    this.process.on('exit', (code) => {
      console.error('[coral] process exited with code', code);
      this.initialized = false;
      this.initPromise = null;
    });

    // MCP initialize handshake
    await this.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'sre-investigator', version: '0.1.0' },
    });

    // Notify initialized (MCP spec requirement)
    this.process.stdin!.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n'
    );

    this.initialized = true;
  }

  private flush(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as JsonRpcResponse;
        if (msg.id == null) continue; // notification, ignore
        const handler = this.pending.get(msg.id);
        if (!handler) continue;
        this.pending.delete(msg.id);
        if (msg.error) handler.reject(new Error(msg.error.message));
        else handler.resolve(msg.result);
      } catch {
        // non-JSON line
      }
    }
  }

  private rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });

      const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
      this.process!.stdin!.write(JSON.stringify(req) + '\n');

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Coral timeout: ${method} id=${id}`));
        }
      }, 45_000);
    });
  }

  async query(sql: string): Promise<CoralQueryResult> {
    await this.connect();

    const start = Date.now();
    const result = (await this.rpc('tools/call', {
      name: 'query',
      arguments: { sql },
    })) as { content: Array<{ type: string; text: string }> };

    const text = result.content.find((c) => c.type === 'text')?.text ?? '[]';

    let rows: Record<string, unknown>[];
    try {
      rows = JSON.parse(text) as Record<string, unknown>[];
    } catch {
      // Coral may return CSV-like text on error; surface as empty
      console.error('[coral] unexpected query result format:', text.slice(0, 200));
      rows = [];
    }

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return {
      columns,
      rows,
      row_count: rows.length,
      execution_ms: Date.now() - start,
    };
  }

  disconnect(): void {
    this.process?.kill();
    this.initialized = false;
    this.initPromise = null;
  }
}

// Singleton — one coral process per API instance
export const coral = new CoralClient();

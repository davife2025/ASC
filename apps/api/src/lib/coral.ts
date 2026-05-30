import { spawn, type ChildProcess } from 'child_process';
import { env } from '../config/env.js';
import type { CoralQueryResult } from '@sre/types';

/**
 * Coral MCP client — communicates with `coral mcp-stdio` over JSON-RPC stdio.
 *
 * MCP tools exposed by Coral (from docs):
 *   sql            — execute read-only SQL, returns rows as JSON
 *   list_catalog   — list tables / table functions with pagination
 *   search_catalog — regex search over catalog metadata
 *   describe_table — compact metadata for one table
 *   list_columns   — paginated columns for one table
 *
 * ⚠️  The tool name is "sql", NOT "query".
 *     Using "query" causes a silent "unknown tool" error from the MCP server.
 *
 * Set CORAL_ENABLED=false in your .env to skip coral entirely (e.g. local dev).
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

// Shape returned by the Coral `sql` MCP tool
interface CoralSqlResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

class CoralClient {
  private process: ChildProcess | null = null;
  private buffer = '';
  private pending = new Map<
    number,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private nextId = 1;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private get isEnabled(): boolean {
    return process.env.CORAL_ENABLED === 'true';
  }

  private sourceEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      // Source credentials read by Coral at query time from env
      PAGERDUTY_API_TOKEN:   env.coral.pagerdutyToken,
      DD_API_KEY:            env.coral.ddApiKey,
      DD_APPLICATION_KEY:    env.coral.ddAppKey,
      DD_SITE:               env.coral.ddSite,
      GITHUB_TOKEN:          env.coral.githubToken,
      STATUSGATOR_API_TOKEN: env.coral.statusgatorToken,
      // Persist Coral state across restarts (important in Docker)
      ...(env.coralConfigDir ? { CORAL_CONFIG_DIR: env.coralConfigDir } : {}),
    };
  }

  connect(): Promise<void> {
    // Skip if coral is disabled via env var
    if (!this.isEnabled) {
      return Promise.reject(
        new Error('Coral is disabled — set CORAL_ENABLED=true in your .env to enable it'),
      );
    }

    if (this.initialized) return Promise.resolve();
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._connect().catch((err) => {
      this.initPromise = null;
      throw err;
    });
    return this.initPromise;
  }

  private async _connect(): Promise<void> {
    // Spawn the coral process
    this.process = spawn('coral', ['mcp-stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: this.sourceEnv(),
    });

    // Wait for either a successful spawn or an error (e.g. ENOENT = not installed)
    await new Promise<void>((resolve, reject) => {
      this.process!.on('error', (err) => {
        reject(
          new Error(
            `Failed to start coral CLI: ${err.message}. ` +
            `Make sure 'coral' is installed and available in your PATH, ` +
            `or set CORAL_ENABLED=false to skip coral in local dev.`,
          ),
        );
      });
      // 'spawn' event fires once the process has successfully started
      this.process!.on('spawn', () => resolve());
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
      // Reject all pending so callers don't hang
      const err = new Error(`Coral process exited (code ${code})`);
      for (const [id, handler] of this.pending) {
        clearTimeout(handler.timer);
        handler.reject(err);
        this.pending.delete(id);
      }
    });

    // MCP initialize handshake
    await this.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'sre-investigator', version: '0.1.0' },
    });

    // Required by MCP spec after initialize resolves
    this.process.stdin!.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n',
    );

    // Only mark initialized AFTER handshake fully completes
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
        if (msg.id == null) continue; // notification
        const handler = this.pending.get(msg.id);
        if (!handler) continue;
        clearTimeout(handler.timer);
        this.pending.delete(msg.id);
        if (msg.error) handler.reject(new Error(msg.error.message));
        else handler.resolve(msg.result);
      } catch {
        // non-JSON line (e.g. startup log)
      }
    }
  }

  private rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error('Coral process not started'));
        return;
      }
      const id = this.nextId++;
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Coral timeout: ${method} id=${id}`));
        }
      }, 45_000);

      this.pending.set(id, { resolve, reject, timer });
      const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
      this.process.stdin!.write(JSON.stringify(req) + '\n');
    });
  }

  async query(sql: string): Promise<CoralQueryResult> {
    await this.connect();

    const start = Date.now();

    // ✅ CORRECT tool name: "sql" (not "query")
    const result = (await this.rpc('tools/call', {
      name: 'sql',
      arguments: { sql },
    })) as CoralSqlResult;

    if (result.isError) {
      const errMsg = result.content.find((c) => c.type === 'text')?.text ?? 'Unknown Coral error';
      throw new Error(`Coral SQL error: ${errMsg}`);
    }

    const text = result.content.find((c) => c.type === 'text')?.text ?? '[]';

    let rows: Record<string, unknown>[];
    try {
      rows = JSON.parse(text) as Record<string, unknown>[];
    } catch {
      console.error('[coral] unexpected result format:', text.slice(0, 200));
      rows = [];
    }

    return {
      columns: rows.length > 0 ? Object.keys(rows[0]) : [],
      rows,
      row_count: rows.length,
      execution_ms: Date.now() - start,
    };
  }

  /** Use the list_catalog MCP tool for schema discovery (no raw SQL needed) */
  async listCatalog(
    schema?: string,
  ): Promise<Array<{ schema: string; table: string; kind: string }>> {
    await this.connect();

    const result = (await this.rpc('tools/call', {
      name: 'list_catalog',
      arguments: { ...(schema ? { schema } : {}), limit: 200 },
    })) as CoralSqlResult;

    const text = result.content.find((c) => c.type === 'text')?.text ?? '[]';
    try {
      return JSON.parse(text) as Array<{ schema: string; table: string; kind: string }>;
    } catch {
      return [];
    }
  }

  disconnect(): void {
    this.process?.kill();
    this.initialized = false;
    this.initPromise = null;
  }
}

export const coral = new CoralClient();
import { spawn, type ChildProcess } from 'child_process';
import type { CoralQueryResult } from '@sre/types';

// Coral runs as a local MCP stdio server.
// We communicate via JSON-RPC over stdin/stdout.

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
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private nextId = 1;
  private initialized = false;

  async connect(): Promise<void> {
    if (this.initialized) return;

    this.process = spawn('coral', ['mcp-stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
      },
    });

    this.process.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.flush();
    });

    this.process.stderr!.on('data', (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) console.error('[coral stderr]', msg);
    });

    this.process.on('exit', (code) => {
      console.error('[coral] process exited with code', code);
      this.initialized = false;
    });

    // MCP initialize handshake
    await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'sre-investigator', version: '0.0.1' },
    });

    this.initialized = true;
  }

  private flush(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as JsonRpcResponse;
        const handler = this.pending.get(msg.id);
        if (!handler) continue;
        this.pending.delete(msg.id);
        if (msg.error) {
          handler.reject(new Error(msg.error.message));
        } else {
          handler.resolve(msg.result);
        }
      } catch {
        // non-JSON line, ignore
      }
    }
  }

  private send(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });

      const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
      this.process!.stdin!.write(JSON.stringify(req) + '\n');

      // Timeout after 30s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Coral request timed out: ${method}`));
        }
      }, 30_000);
    });
  }

  async query(sql: string): Promise<CoralQueryResult> {
    await this.connect();

    const result = await this.send('tools/call', {
      name: 'query',
      arguments: { sql },
    }) as { content: Array<{ type: string; text: string }> };

    const text = result.content.find((c) => c.type === 'text')?.text ?? '[]';
    const rows = JSON.parse(text) as Record<string, unknown>[];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return { columns, rows, row_count: rows.length, execution_ms: 0 };
  }

  disconnect(): void {
    this.process?.kill();
    this.initialized = false;
  }
}

export const coral = new CoralClient();

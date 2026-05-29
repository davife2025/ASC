import { env } from '../config/env.js';

const HF_API_BASE =
  'https://api-inference.huggingface.co/models/moonshotai/Kimi-K2-Instruct/v1';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionOptions {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

interface HFChatResponse {
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  error?: string;
}

// ─── Retry with exponential backoff ─────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 4000
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries === 0) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    // Retry on HF model-loading 503 or rate limit 429
    const retryable = msg.includes('503') || msg.includes('429') || msg.includes('loading');
    if (!retryable) throw err;
    console.warn(`[llm] retryable error, retrying in ${delayMs}ms (${retries} left): ${msg}`);
    await sleep(delayMs);
    return withRetry(fn, retries - 1, delayMs * 2);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Chat completion ─────────────────────────────────────────────────────────

export async function chatCompletion(options: ChatCompletionOptions): Promise<string> {
  const { messages, maxTokens = 2048, temperature = 0.1 } = options;

  return withRetry(async () => {
    const res = await fetch(`${HF_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.hfToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'moonshotai/Kimi-K2-Instruct',
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }),
    });

    const data = (await res.json()) as HFChatResponse;

    if (!res.ok) {
      const errMsg = data.error ?? `HTTP ${res.status}`;
      throw new Error(`HuggingFace API error ${res.status}: ${errMsg}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from Kimi K2');

    return content;
  });
}

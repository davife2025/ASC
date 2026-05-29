import { env } from '../config/env.js';

const HF_API_BASE = 'https://api-inference.huggingface.co/models/moonshotai/Kimi-K2-Instruct/v1';

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
}

export async function chatCompletion(options: ChatCompletionOptions): Promise<string> {
  const { messages, maxTokens = 2048, temperature = 0.2 } = options;

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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HuggingFace API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as HFChatResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) throw new Error('Empty response from Kimi K2');
  return content;
}

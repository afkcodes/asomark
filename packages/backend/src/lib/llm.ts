import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { env } from '../config/env.js';

// ─── Types ───

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface LLMOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
}

export type LLMProvider = 'claude' | 'openai' | 'openrouter';

// ─── Clients (lazy-initialized) ───

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;
let openrouterClient: OpenAI | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
    anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
    openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function getOpenRouter(): OpenAI {
  if (!openrouterClient) {
    if (!env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set');
    openrouterClient = new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://asomark.dev',
        'X-Title': 'ASOMARK',
      },
    });
  }
  return openrouterClient;
}

// ─── Provider implementations ───

async function callClaude(
  messages: LLMMessage[],
  opts: LLMOptions = {},
): Promise<LLMResponse> {
  const client = getAnthropic();
  const model = opts.model ?? 'claude-sonnet-4-20250514';
  const response = await client.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.3,
    system: opts.system ?? '',
    messages,
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return {
    content: textBlock?.text ?? '',
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    model,
  };
}

async function callOpenAICompat(
  client: OpenAI,
  messages: LLMMessage[],
  opts: LLMOptions & { defaultModel: string },
): Promise<LLMResponse> {
  const model = opts.model ?? opts.defaultModel;
  const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [];

  if (opts.system) {
    openaiMessages.push({ role: 'system', content: opts.system });
  }
  for (const msg of messages) {
    openaiMessages.push({ role: msg.role, content: msg.content });
  }

  const response = await client.chat.completions.create({
    model,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.3,
    messages: openaiMessages,
  });

  return {
    content: response.choices[0]?.message?.content ?? '',
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    model,
  };
}

// ─── Provider resolution ───

function resolveProvider(): LLMProvider {
  if (env.OPENROUTER_API_KEY) return 'openrouter';
  if (env.ANTHROPIC_API_KEY) return 'claude';
  if (env.OPENAI_API_KEY) return 'openai';
  throw new Error(
    'No LLM API key configured. Set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY in .env',
  );
}

// Default model per provider
const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openrouter: 'anthropic/claude-sonnet-4.6',
  claude: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
};

function callProvider(
  provider: LLMProvider,
  messages: LLMMessage[],
  opts: LLMOptions,
): Promise<LLMResponse> {
  switch (provider) {
    case 'claude':
      return callClaude(messages, opts);
    case 'openai':
      return callOpenAICompat(getOpenAI(), messages, {
        ...opts,
        defaultModel: DEFAULT_MODELS.openai,
      });
    case 'openrouter':
      return callOpenAICompat(getOpenRouter(), messages, {
        ...opts,
        defaultModel: DEFAULT_MODELS.openrouter,
      });
  }
}

// ─── Public API ───

/**
 * Call the LLM with a conversation. Auto-selects provider based on available API keys.
 * Priority: OpenRouter > Claude > OpenAI
 */
export async function llm(
  messages: LLMMessage[],
  opts: LLMOptions & { provider?: LLMProvider } = {},
): Promise<LLMResponse> {
  const provider = opts.provider ?? resolveProvider();
  return callProvider(provider, messages, opts);
}

/**
 * Shorthand: send a single prompt and get a string response.
 */
export async function ask(
  prompt: string,
  opts: LLMOptions & { provider?: LLMProvider } = {},
): Promise<string> {
  const response = await llm([{ role: 'user', content: prompt }], opts);
  return response.content;
}

/**
 * Ask the LLM and parse the response as JSON.
 * Automatically strips markdown code fences if present.
 */
export async function askJSON<T = unknown>(
  prompt: string,
  opts: LLMOptions & { provider?: LLMProvider } = {},
): Promise<T> {
  const raw = await ask(prompt, opts);
  const cleaned = raw.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
  return JSON.parse(cleaned) as T;
}

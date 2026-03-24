import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { env } from '../config/env.js';
import { db } from '../db/index.js';
import { settings } from '../db/schema/settings.js';
import { inArray } from 'drizzle-orm';

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

// ─── DB settings cache (5-minute TTL) ───

interface ApiKeys {
  anthropic?: string;
  openai?: string;
  openrouter?: string;
}

let cachedKeys: ApiKeys | null = null;
let cacheExpiry = 0;

async function getApiKeys(): Promise<ApiKeys> {
  if (cachedKeys && Date.now() < cacheExpiry) return cachedKeys;
  try {
    const rows = await db
      .select()
      .from(settings)
      .where(inArray(settings.key, ['anthropic_api_key', 'openai_api_key', 'openrouter_api_key']));
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    cachedKeys = {
      anthropic: map['anthropic_api_key'] || env.ANTHROPIC_API_KEY,
      openai: map['openai_api_key'] || env.OPENAI_API_KEY,
      openrouter: map['openrouter_api_key'] || env.OPENROUTER_API_KEY,
    };
  } catch {
    // DB not ready yet — fall back to env
    cachedKeys = {
      anthropic: env.ANTHROPIC_API_KEY,
      openai: env.OPENAI_API_KEY,
      openrouter: env.OPENROUTER_API_KEY,
    };
  }
  cacheExpiry = Date.now() + 5 * 60 * 1000;
  return cachedKeys;
}

/** Invalidate the API key cache (call after saving new keys) */
export function invalidateApiKeyCache() {
  cachedKeys = null;
  cacheExpiry = 0;
}

// ─── Clients (created per-call when key may change) ───

async function getAnthropic(): Promise<Anthropic> {
  const keys = await getApiKeys();
  if (!keys.anthropic) throw new Error('ANTHROPIC_API_KEY is not set');
  return new Anthropic({ apiKey: keys.anthropic });
}

async function getOpenAI(): Promise<OpenAI> {
  const keys = await getApiKeys();
  if (!keys.openai) throw new Error('OPENAI_API_KEY is not set');
  return new OpenAI({ apiKey: keys.openai });
}

async function getOpenRouter(): Promise<OpenAI> {
  const keys = await getApiKeys();
  if (!keys.openrouter) throw new Error('OPENROUTER_API_KEY is not set');
  return new OpenAI({
    apiKey: keys.openrouter,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'https://asomark.dev',
      'X-Title': 'ASOMARK',
    },
  });
}

// ─── Provider implementations ───

async function callClaude(
  messages: LLMMessage[],
  opts: LLMOptions = {},
): Promise<LLMResponse> {
  const client = await getAnthropic();
  const model = opts.model ?? 'claude-sonnet-4-20250514';
  const response = await client.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.3,
    system: opts.system ?? '',
    messages,
  });

  const textBlock = response.content.find((b) => b.type === 'text') as { type: 'text'; text: string } | undefined;
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

async function resolveProvider(): Promise<LLMProvider> {
  const keys = await getApiKeys();
  if (keys.openrouter) return 'openrouter';
  if (keys.anthropic) return 'claude';
  if (keys.openai) return 'openai';
  throw new Error(
    'No LLM API key configured. Set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY in .env or in Settings.',
  );
}

// Default model per provider
const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openrouter: 'anthropic/claude-sonnet-4.6',
  claude: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
};

async function callProvider(
  provider: LLMProvider,
  messages: LLMMessage[],
  opts: LLMOptions,
): Promise<LLMResponse> {
  switch (provider) {
    case 'claude':
      return callClaude(messages, opts);
    case 'openai':
      return callOpenAICompat(await getOpenAI(), messages, {
        ...opts,
        defaultModel: DEFAULT_MODELS.openai,
      });
    case 'openrouter':
      return callOpenAICompat(await getOpenRouter(), messages, {
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
  const provider = opts.provider ?? await resolveProvider();
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

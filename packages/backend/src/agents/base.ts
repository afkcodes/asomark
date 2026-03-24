import { db } from '../db/index.js';
import { strategyLog } from '../db/schema/strategy.js';
import { llm, askJSON, type LLMMessage, type LLMOptions, type LLMProvider } from '../lib/llm.js';

export type AgentAuthorityLevel = 'L0' | 'L1' | 'L2' | 'L3';

// ─── Types ───

export interface AgentContext {
  appId?: string;
  platform?: 'android' | 'ios';
  region?: string;
  provider?: LLMProvider;
}

export interface AgentAction {
  actionType: string;
  reasoning: string;
  suggestedChange: string;
  authorityLevel: AgentAuthorityLevel;
}

export interface AgentResult<T = unknown> {
  data: T;
  actions: AgentAction[];
  tokensUsed: { input: number; output: number };
}

// ─── Base Agent ───

export abstract class BaseAgent {
  abstract readonly name: string;
  abstract readonly description: string;

  protected totalInputTokens = 0;
  protected totalOutputTokens = 0;

  /** System prompt for this agent */
  protected abstract getSystemPrompt(ctx: AgentContext): string;

  /** Call the LLM with this agent's system prompt */
  protected async chat(
    messages: LLMMessage[],
    ctx: AgentContext,
    opts: LLMOptions = {},
  ) {
    const response = await llm(messages, {
      system: this.getSystemPrompt(ctx),
      provider: ctx.provider,
      ...opts,
    });
    this.totalInputTokens += response.inputTokens;
    this.totalOutputTokens += response.outputTokens;
    return response;
  }

  /** Call the LLM and parse JSON response */
  protected async chatJSON<T>(
    prompt: string,
    ctx: AgentContext,
    opts: LLMOptions = {},
  ): Promise<T> {
    const response = await this.chat(
      [{ role: 'user', content: prompt }],
      ctx,
      opts,
    );
    const parsed = this.extractJSON<T>(response.content);
    return parsed;
  }

  /** Robustly extract JSON from LLM response text */
  private extractJSON<T>(text: string): T {
    // 1. Strip all markdown code fences
    let cleaned = text
      .replace(/```(?:json)?\s*\n?/g, '')
      .replace(/```\s*/g, '')
      .trim();

    // 2. Try parsing directly
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // Continue
    }

    // 3. Try to find JSON object/array boundaries
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    let startChar = -1;
    let endChar: '}' | ']' = '}';

    if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) {
      startChar = firstBrace;
      endChar = '}';
    } else if (firstBracket >= 0) {
      startChar = firstBracket;
      endChar = ']';
    }

    if (startChar >= 0) {
      const lastEnd = cleaned.lastIndexOf(endChar);
      if (lastEnd > startChar) {
        const jsonStr = cleaned.slice(startChar, lastEnd + 1);
        try {
          return JSON.parse(jsonStr) as T;
        } catch {
          // Continue
        }
      }
    }

    // 4. Last resort: try to fix common issues (trailing commas, single quotes)
    try {
      const fixed = cleaned
        .replace(/,\s*([\]}])/g, '$1') // trailing commas
        .replace(/'/g, '"'); // single quotes
      return JSON.parse(fixed) as T;
    } catch {
      throw new Error(
        `Failed to parse JSON from LLM response. First 500 chars: ${text.slice(0, 500)}`,
      );
    }
  }

  /** Log an action to the strategy_log table */
  protected async logAction(
    action: AgentAction,
    ctx: AgentContext,
  ): Promise<string> {
    const [entry] = await db
      .insert(strategyLog)
      .values({
        appId: ctx.appId ?? null,
        actionType: `${this.name}:${action.actionType}`,
        reasoning: action.reasoning,
        suggestedChange: action.suggestedChange,
        authorityLevel: action.authorityLevel,
        status: action.authorityLevel === 'L0' ? 'executed' : 'pending',
        createdAt: new Date(),
        executedAt: action.authorityLevel === 'L0' ? new Date() : null,
      })
      .returning();
    return entry!.id;
  }

  /** Log multiple actions and return their IDs */
  protected async logActions(
    actions: AgentAction[],
    ctx: AgentContext,
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const action of actions) {
      ids.push(await this.logAction(action, ctx));
    }
    return ids;
  }

  /** Get token usage for this agent run */
  protected getTokenUsage() {
    return { input: this.totalInputTokens, output: this.totalOutputTokens };
  }

  /** Reset token counters */
  protected resetTokens() {
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
  }
}

/**
 * AI Visibility Checker — query LLMs about a brand and analyze mentions.
 * Uses our existing LLM infrastructure (Claude/OpenAI/OpenRouter).
 */
import { llm, type LLMResponse } from './llm.js';

export interface MentionCheckResult {
  prompt: string;
  platform: string;
  response: string;
  mentioned: boolean;
  sentiment: 'positive' | 'neutral' | 'negative';
  position: number | null;
  competitorsMentioned: string[];
}

/**
 * Generate default prompts for a brand/app.
 * These are the queries real users ask AI assistants.
 */
export function generateDefaultPrompts(
  appName: string,
  category: string,
  seedKeywords: string[],
): string[] {
  const prompts: string[] = [];

  // Recommendation prompts
  prompts.push(`What are the best ${category.toLowerCase()} apps for Android?`);
  prompts.push(`Recommend a good expense tracker app`);
  prompts.push(`What app should I use to track my daily expenses?`);

  // Comparison prompts
  prompts.push(`What are the best alternatives to YNAB?`);
  prompts.push(`Compare the top budget tracking apps for Android in 2026`);

  // Brand-specific
  prompts.push(`What do you know about ${appName}?`);
  prompts.push(`Is ${appName} a good app for managing personal finances?`);

  // Feature-based
  for (const kw of seedKeywords.slice(0, 2)) {
    prompts.push(`What's the best app for ${kw}?`);
  }

  return prompts;
}

/**
 * Query an LLM with a prompt and analyze the response for brand mentions.
 */
export async function checkMention(
  prompt: string,
  brandName: string,
  competitorNames: string[],
): Promise<MentionCheckResult> {
  // Query the LLM naturally (as a user would)
  const result = await llm(
    [{ role: 'user', content: prompt }],
    {
      system: 'You are a helpful assistant. Answer the user\'s question naturally and thoroughly. If recommending apps, include specific app names.',
      maxTokens: 1024,
      temperature: 0.7,
    },
  );

  const response = result.content;
  const responseLower = response.toLowerCase();
  const brandLower = brandName.toLowerCase();

  // Check if brand is mentioned
  const mentioned = responseLower.includes(brandLower);

  // Find position (which app is mentioned first, second, etc.)
  let position: number | null = null;
  if (mentioned) {
    // Split response into sentences/sections and find where brand appears
    const allApps = [brandName, ...competitorNames];
    const positions = allApps
      .map((name) => ({
        name,
        index: responseLower.indexOf(name.toLowerCase()),
      }))
      .filter((p) => p.index !== -1)
      .sort((a, b) => a.index - b.index);

    const brandPos = positions.findIndex((p) => p.name.toLowerCase() === brandLower);
    position = brandPos !== -1 ? brandPos + 1 : null;
  }

  // Check which competitors are mentioned
  const competitorsMentioned = competitorNames.filter((comp) =>
    responseLower.includes(comp.toLowerCase()),
  );

  // Determine sentiment
  let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
  if (mentioned) {
    // Look at the sentence containing the brand name
    const brandIndex = responseLower.indexOf(brandLower);
    const surroundingText = response.slice(
      Math.max(0, brandIndex - 100),
      Math.min(response.length, brandIndex + brandLower.length + 200),
    ).toLowerCase();

    const positiveSignals = ['great', 'excellent', 'best', 'recommend', 'love', 'popular', 'top', 'powerful', 'useful', 'impressive', 'solid', 'standout', 'favorite'];
    const negativeSignals = ['poor', 'bad', 'avoid', 'worst', 'limited', 'lacking', 'disappointing', 'outdated', 'buggy', 'unreliable'];

    const posCount = positiveSignals.filter((s) => surroundingText.includes(s)).length;
    const negCount = negativeSignals.filter((s) => surroundingText.includes(s)).length;

    if (posCount > negCount) sentiment = 'positive';
    else if (negCount > posCount) sentiment = 'negative';
  }

  return {
    prompt,
    platform: result.model?.includes('claude') ? 'claude'
      : result.model?.includes('gpt') ? 'openai'
      : 'openrouter',
    response,
    mentioned,
    sentiment,
    position,
    competitorsMentioned,
  };
}

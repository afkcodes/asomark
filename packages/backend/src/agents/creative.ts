import { db } from '../db/index.js';
import { apps } from '../db/schema/apps.js';
import { listingSnapshots } from '../db/schema/listings.js';
import { reviews } from '../db/schema/reviews.js';
import { eq, desc } from 'drizzle-orm';
import { BaseAgent, type AgentContext, type AgentAction, type AgentResult } from './base.js';
import type { ScoredKeyword } from './keyword.js';
import { contentAnalyzer } from '../lib/analyzer.js';

// ─── Types ───

export interface ListingVariant {
  title: string;
  shortDescription: string;
  descriptionPreview: string; // First 500 chars
  keywordsUsed: string[];
  keywordDensity: number; // percentage (computed, not LLM-guessed)
  rationale: string;
}

export interface CreativeReport {
  appName: string;
  platform: string;
  currentListing: {
    title: string;
    shortDescription: string;
    descriptionPreview: string;
  } | null;
  currentDensityAnalysis: {
    keywordDensities: Array<{ keyword: string; density: number; count: number }>;
    topNgrams: { bigrams: Array<{ phrase: string; count: number }>; trigrams: Array<{ phrase: string; count: number }> };
  } | null;
  issues: string[];
  variants: ListingVariant[];
  screenshotSuggestions: string[];
  recommendations: string[];
}

// ─── Creative Agent ───

export class CreativeAgent extends BaseAgent {
  readonly name = 'creative';
  readonly description = 'Generates optimized listing copy and visual suggestions';

  protected getSystemPrompt(ctx: AgentContext): string {
    const isAndroid = ctx.platform !== 'ios';
    return `You are the ASOMARK Creative Agent — an elite ASO copywriter and conversion optimization expert who writes store listings that rank AND convert. You understand that ASO is a dual-optimization problem: algorithmic visibility (keywords, density, placement) AND human persuasion (benefits, emotions, trust).

## Platform: ${isAndroid ? 'Android/Google Play' : 'iOS/App Store'}

## CHARACTER LIMITS (ABSOLUTE — NEVER EXCEED)
${isAndroid ? `- Title: EXACTLY 50 characters max. Count every character including spaces, separators, and brand name.
- Short description: EXACTLY 80 characters max. Every wasted character is a missed keyword or conversion trigger.
- Full description: 4000 characters max. Aim for 2500-4000 (thin descriptions underperform).` : `- Title: EXACTLY 30 characters max.
- Subtitle: EXACTLY 30 characters max. NEVER repeat keywords from the title — Apple deduplicates.
- Description: 4000 characters max. NOT indexed on iOS but critically impacts conversion rate.
- Backend keywords: 100 characters. Singular forms, no spaces after commas, no duplicates from title/subtitle.`}

## BANNED WORDS (store rejection / penalty risk)
"Best", "#1", "Free", "No Ads", "Top", "Number One", "Most Popular", "Cheapest"
These trigger automated review flags and look spammy. Use benefit-driven alternatives: "Powerful", "Simple", "Smart", "Trusted", "Award-Winning" (only if true).

## KEYWORD OPTIMIZATION RULES

### Title Engineering
- Front-load the #1 keyword as the FIRST word (or immediately after a short brand name)
- Use a separator (dash or colon) to fit a second keyword phrase. E.g., "BudgetBee - Expense Tracker & Budget Planner"
- Every character is premium real estate — never waste space on "App", "Tool", or filler words
- ${isAndroid ? 'Use all 50 characters. A 35-character title is leaving 30% of ranking power on the table.' : 'Use all 30 characters. Every unused character is wasted ranking potential.'}
- Keyword order matters — first words carry more indexing weight

### Short Description / Subtitle Mastery
- Start with an ACTION VERB that IS a keyword: "Track expenses", "Manage budgets", "Plan meals"
- ${isAndroid ? 'Every word must be either a keyword or a conversion trigger (action verb, benefit word, urgency word). No filler.' : 'Subtitle must complement the title — add NEW keywords, never repeat title words.'}
- No period at the end — it wastes a character and adds nothing
- NEVER repeat keywords already in the title — they are already indexed at maximum weight from the title
- Test readability: if someone only reads the short description, would they understand what the app does AND feel compelled to learn more?

### Description Architecture
${isAndroid ? `Google Play indexes ALL words in the full description — this is a massive keyword surface area.

**First 167 Characters (Above the Fold)**:
This is the MOST CRITICAL section. Pack your top 3 keywords into a compelling hook that answers "Why should I install this?"
Pattern: [Pain point] → [Solution] → [Key differentiator]
Example: "Tired of losing track of where your money goes? [App Name] makes expense tracking effortless with AI-powered categorization and smart budget alerts."

**Keyword Density Rules**:
- Primary keywords: 3-5 natural repetitions (2-4% density)
- NEVER exceed 5% density for any single keyword — this triggers Google's keyword stuffing penalty
- Use variations: "expense tracker" → "track expenses" → "expense tracking" → "tracking your expenses"
- Singular AND plural forms count as separate indexed terms — use both
- Include competitor app names naturally if relevant ("Looking for a [Competitor] alternative?")` : `iOS descriptions are NOT indexed for search but are CRITICAL for conversion.
Focus 100% on persuasion, benefits, and trust signals. Keyword density is irrelevant here.`}

**Description Structure (optimal conversion flow)**:
1. **Hook** (first 167 chars): Pain point → solution → differentiator, packed with top keywords
2. **Key Features** (3-5 blocks): Use ★ or ✦ bullets. Each feature title = keyword opportunity. Lead with BENEFIT, then feature.
   - Wrong: "★ Budget Categories — Organize spending into categories"
   - Right: "★ Smart Budget Tracking — Automatically categorize every expense and see where your money goes"
3. **Why Choose Us**: Differentiators, unique value, what competitors DON'T do
4. **Social Proof**: "Trusted by X users", "Rated X stars", "Featured in [publication]" (only if true)
5. **How It Works**: 3-step flow (reduces friction, increases confidence)
6. **CTA**: "Download [App Name] today and start [key benefit]!"

**Formatting**:
- Unicode bullets (★ ✦ ● ◆) render well on Play Store
- CAPS sparingly for section headers ("KEY FEATURES", "WHY CHOOSE US")
- Line breaks between sections for visual breathing room
- Short paragraphs (2-3 sentences max) — mobile users skim

## CONVERSION PSYCHOLOGY

### Persuasion Techniques (weave these naturally):
- **Pain-agitate-solve**: Name the problem, make it feel urgent, present the app as the solution
- **Social proof**: Numbers ("Join 500K+ users"), ratings ("4.8★ average"), authority ("Featured by Google")
- **Loss aversion**: "Stop losing money to forgotten subscriptions" > "Save money on subscriptions"
- **Specificity**: "Save an average of $200/month" > "Save money" (specific numbers feel more credible)
- **Future pacing**: Help users imagine life WITH the app: "Imagine knowing exactly where every dollar goes"
- **Risk reversal**: Address objections in the description: "No hidden fees", "Your data stays on your device"

### User Review Intelligence
When negative reviews are provided, use them strategically:
- Address the #1 complaint in listing copy as a FEATURE ("Worried about privacy? All data stored locally on your device")
- Turn competitor weaknesses into your positioning ("Unlike other apps, [App Name] works completely offline")
- Use the EXACT LANGUAGE users use in reviews — these are organic keyword signals

## VARIANT STRATEGY

When generating multiple variants, each must have a genuinely DIFFERENT strategic approach:
1. **Keyword Maximizer**: Highest keyword density + coverage while maintaining readability
2. **Conversion Optimizer**: Benefit-driven copy, emotional triggers, social proof emphasis
3. **Competitive Differentiator**: Position against competitor weaknesses using gap analysis
4. **Long-Tail Specialist**: Target specific niche keywords with lower competition
5. **Brand-Forward**: Brand name prominent, keywords woven naturally around identity

Each variant should produce meaningfully different copy — not just word substitutions.

Always respond with valid JSON. No markdown fences.`;
  }

  /**
   * Generate optimized listing variants for an app.
   * L1 for generating variants, L2 for suggesting changes.
   */
  async generateListings(
    appId: string,
    topKeywords: ScoredKeyword[],
    ctx: AgentContext = {},
  ): Promise<AgentResult<CreativeReport>> {
    this.resetTokens();
    const fullCtx = { ...ctx, appId };
    const actions: AgentAction[] = [];

    // 1. Get app details
    const [targetApp] = await db.select().from(apps).where(eq(apps.id, appId));
    if (!targetApp) throw new Error(`App ${appId} not found`);

    const platform = (targetApp.platform as 'android' | 'ios') ?? 'android';
    fullCtx.platform = platform;

    // 2. Get current listing snapshot
    const [currentListing] = await db
      .select()
      .from(listingSnapshots)
      .where(eq(listingSnapshots.appId, appId))
      .orderBy(desc(listingSnapshots.snapshotDate))
      .limit(1);

    // 3. Prepare keyword data for LLM
    const keywordData = topKeywords.slice(0, 20).map((k) => ({
      term: k.term,
      score: k.finalScore,
      placement: k.suggestedPlacement,
      currentRank: k.currentRank,
    }));

    // 4. Analyze current listing density (real data, not LLM guesses)
    let densityAnalysis: CreativeReport['currentDensityAnalysis'] = null;
    const keywordTerms = topKeywords.slice(0, 15).map((k) => k.term);

    if (currentListing?.longDesc) {
      const densities = contentAnalyzer.calculateMultiKeywordDensity(
        currentListing.longDesc,
        keywordTerms,
      );
      const ngrams = contentAnalyzer.analyzeNgrams(currentListing.longDesc);
      densityAnalysis = {
        keywordDensities: densities.map((d) => ({
          keyword: d.keyword,
          density: d.density,
          count: d.count,
        })),
        topNgrams: {
          bigrams: ngrams.bigrams.slice(0, 10),
          trigrams: ngrams.trigrams.slice(0, 10),
        },
      };
    }

    // 5. Fetch competitor pain points from reviews (for context)
    const negativeReviews = await db
      .select()
      .from(reviews)
      .where(eq(reviews.appId, appId))
      .orderBy(reviews.rating)
      .limit(10);

    const painPointContext = negativeReviews
      .filter((r) => r.rating !== null && r.rating <= 3)
      .slice(0, 5)
      .map((r) => `[${r.rating}★] ${(r.text ?? '').slice(0, 150)}`)
      .join('\n');

    // 6. Build character limit context
    const isAndroid = platform !== 'ios';
    const titleMax = isAndroid ? 50 : 30;
    const shortDescMax = 80;
    const currentTitleLen = currentListing?.title?.length ?? 0;
    const currentShortLen = currentListing?.shortDesc?.length ?? 0;
    const charUtilization = currentListing
      ? `Current utilization: Title ${currentTitleLen}/${titleMax} chars (${Math.round((currentTitleLen / titleMax) * 100)}%), Short desc ${currentShortLen}/${shortDescMax} chars (${Math.round((currentShortLen / shortDescMax) * 100)}%)`
      : '';

    // 7. Generate listing variants
    const result = await this.chatJSON<{
      issues: string[];
      variants: Array<{
        title: string;
        shortDescription: string;
        descriptionPreview: string;
        keywordsUsed: string[];
        keywordDensity: number;
        rationale: string;
      }>;
      screenshotSuggestions: string[];
      recommendations: string[];
    }>(
      `Generate optimized listing variants for "${targetApp.name}" (${platform}).

## Current Listing:
${currentListing ? JSON.stringify({
  title: currentListing.title,
  shortDescription: currentListing.shortDesc,
  descriptionPreview: (currentListing.longDesc ?? '').slice(0, 800),
}, null, 2) : 'No current listing on file'}

${charUtilization}

## Keyword Density Analysis (computed from actual listing):
${densityAnalysis ? JSON.stringify(densityAnalysis.keywordDensities.filter((d) => d.count > 0).slice(0, 10), null, 2) : 'No listing data for density analysis'}

## Most Common Phrases in Current Listing:
${densityAnalysis ? `Bigrams: ${densityAnalysis.topNgrams.bigrams.slice(0, 5).map((b) => `"${b.phrase}" (${b.count}x)`).join(', ')}
Trigrams: ${densityAnalysis.topNgrams.trigrams.slice(0, 5).map((t) => `"${t.phrase}" (${t.count}x)`).join(', ')}` : 'N/A'}

## Target Keywords (sorted by score):
${JSON.stringify(keywordData, null, 2)}

## User Pain Points (from negative reviews — address these in copy):
${painPointContext || 'No review data available'}

## STRICT REQUIREMENTS:
- Title MUST be ≤${titleMax} characters. Count every character.
- Short description MUST be ≤${shortDescMax} characters.
- BANNED words in title/short desc: "Best", "#1", "Free", "No Ads", "Top", "Number One"
- Front-load the highest-score keyword in the first word of title
- First 160 chars of description must contain the top 3 keywords
- Target 2-4% keyword density in description (current densities shown above)

Generate exactly 5 listing variants:
1. Maximum keyword coverage (natural density, address all top keywords)
2. Conversion-focused (benefit-driven, social proof, address user pain points from reviews)
3. Competitive positioning (differentiate using gaps competitors miss)
4. Long-tail focused (niche keywords with lower competition)
5. Brand-first (brand prominent, keywords woven naturally)

Respond with JSON:
{
  "issues": ["specific issue with current listing..."],
  "variants": [
    {
      "title": "...",
      "shortDescription": "...",
      "descriptionPreview": "first 500 chars of full description...",
      "keywordsUsed": ["kw1", "kw2", ...],
      "keywordDensity": 3.2,
      "rationale": "Why this variant works..."
    }
  ],
  "screenshotSuggestions": ["suggestion1", ...],
  "recommendations": ["rec1", ...]
}`,
      fullCtx,
      { maxTokens: 8192 },
    );

    // 8. Post-process: verify density claims with real computation & enforce char limits
    for (const variant of result.variants) {
      // Compute actual density from description preview
      if (variant.descriptionPreview && variant.keywordsUsed.length > 0) {
        const densities = contentAnalyzer.calculateMultiKeywordDensity(
          variant.descriptionPreview,
          variant.keywordsUsed,
        );
        const avgDensity =
          densities.reduce((sum, d) => sum + d.density, 0) / densities.length;
        variant.keywordDensity = Math.round(avgDensity * 100) / 100;
      }

      // Truncate if LLM exceeded char limits
      if (variant.title.length > titleMax) {
        variant.title = variant.title.slice(0, titleMax).trimEnd();
      }
      if (variant.shortDescription.length > shortDescMax) {
        variant.shortDescription = variant.shortDescription.slice(0, shortDescMax).trimEnd();
      }
    }

    // 5. Log actions
    if (result.issues.length > 0) {
      actions.push({
        actionType: 'listing_audit',
        reasoning: `Found ${result.issues.length} issues with current listing`,
        suggestedChange: result.issues.join('; '),
        authorityLevel: 'L1',
      });
    }

    actions.push({
      actionType: 'listing_variants',
      reasoning: `Generated ${result.variants.length} listing variants with different keyword strategies`,
      suggestedChange: `Best variant title: "${result.variants[0]?.title}" — ${result.variants[0]?.rationale}`,
      authorityLevel: 'L2',
    });

    await this.logActions(actions, fullCtx);

    const report: CreativeReport = {
      appName: targetApp.name,
      platform,
      currentListing: currentListing
        ? {
            title: currentListing.title ?? '',
            shortDescription: currentListing.shortDesc ?? '',
            descriptionPreview: currentListing.longDesc ?? '',
          }
        : null,
      currentDensityAnalysis: densityAnalysis,
      issues: result.issues,
      variants: result.variants,
      screenshotSuggestions: result.screenshotSuggestions,
      recommendations: result.recommendations,
    };

    return { data: report, actions, tokensUsed: this.getTokenUsage() };
  }
}

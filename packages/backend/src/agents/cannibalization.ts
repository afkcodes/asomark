/**
 * Cannibalization Detector Agent
 *
 * Detects wasted keyword space:
 * 1. Title ↔ Short Description overlap (repeating words wastes characters)
 * 2. High-value keywords buried in description that should be in title/short desc
 * 3. Character space efficiency (how much of limits are used)
 * 4. Cross-app cannibalization (if multiple apps target same keyword)
 *
 * Mostly pure data analysis — LLM used only for final summary.
 */

import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apps } from '../db/schema/apps.js';
import { keywords } from '../db/schema/keywords.js';
import { listingSnapshots } from '../db/schema/listings.js';
import { keywordOpportunities } from '../db/schema/opportunities.js';
import { BaseAgent, type AgentContext, type AgentAction, type AgentResult } from './base.js';

// ─── Types ───

interface OverlapItem {
  word: string;
  inTitle: boolean;
  inShortDesc: boolean;
  inDescription: boolean;
}

interface BuriedKeyword {
  term: string;
  opportunityScore: number;
  currentPlacement: 'description' | 'none';
  suggestedPlacement: 'title' | 'short_description';
  reason: string;
}

interface CharacterEfficiency {
  titleUsed: number;
  titleLimit: number;
  titleUtilization: number;
  shortDescUsed: number;
  shortDescLimit: number;
  shortDescUtilization: number;
  wastedTitleChars: number;
  wastedShortDescChars: number;
}

interface CrossAppOverlap {
  keyword: string;
  apps: { appId: string; name: string; rank: number | null }[];
}

export interface CannibalizationReport {
  appName: string;
  platform: string;
  titleShortDescOverlap: OverlapItem[];
  buriedKeywords: BuriedKeyword[];
  characterEfficiency: CharacterEfficiency;
  crossAppOverlaps: CrossAppOverlap[];
  overlapScore: number;  // 0-100, lower is better
  summary: string;
}

// ─── Constants ───

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'is', 'it', 'by', 'with', 'as', 'be', 'this', 'that', 'from',
  'your', 'you', 'we', 'our', 'my', 'app', 'free', 'best', 'new', 'top',
]);

const ANDROID_TITLE_LIMIT = 50;
const ANDROID_SHORT_DESC_LIMIT = 80;

// ─── CannibalizationDetector ───

export class CannibalizationDetector extends BaseAgent {
  readonly name = 'cannibalization';
  readonly description = 'Detects keyword overlap and wasted character space across listings';

  protected getSystemPrompt(_ctx: AgentContext): string {
    return `You are an expert ASO (App Store Optimization) Cannibalization Analyst specializing in keyword overlap detection and character space efficiency for mobile app listings.

## What is Keyword Cannibalization in ASO

Keyword cannibalization occurs in three forms:
1. SELF-CANNIBALIZATION: A single app's listing wastes precious character space by repeating the same keywords across title, short description, and description. Every repeated word is a missed opportunity to rank for an additional keyword.
2. CROSS-APP CANNIBALIZATION: Multiple apps within the same developer portfolio compete for identical keywords, splitting rank authority instead of each app owning distinct keyword clusters.
3. FIELD OVERLAP INEFFICIENCY: Title, short description, and long description have too much keyword overlap instead of strategically spreading unique keywords across each field to maximize total keyword coverage.

On Google Play, the title (50 chars) carries the highest indexing weight, followed by short description (80 chars), then long description (4000 chars). Repeating a keyword that is already in the title inside the short description provides zero additional ranking benefit — it only wastes characters that could target a new keyword.

## Detection Criteria

Evaluate the provided data against these specific criteria:
- EXACT MATCH OVERLAP: Identify every non-stop-word keyword that appears in both the title AND short description. The title already indexes these words with maximum weight — repeating them in the short description is pure waste.
- CROSS-APP OVERLAP: Flag any keyword targeted by two or more apps in the same portfolio. These apps are splitting Google Play's rank authority between them instead of one app dominating that keyword.
- CHARACTER EFFICIENCY: Calculate the ratio of characters spent on repeated keywords vs characters dedicated to unique keyword coverage. Every character used on a duplicate is a character stolen from a potential new ranking keyword.
- OPPORTUNITY COST: For each repeated keyword, identify what high-value keyword COULD occupy that space instead, based on opportunity scores and search volume.

## Severity Assessment

Classify each finding using these severity levels:
- CRITICAL: More than 30% of title characters overlap with short description keywords. This indicates severe character waste in the two highest-weight fields.
- HIGH: The same primary keyword (highest volume or most important brand term) is targeted across multiple apps in the portfolio, causing direct rank competition.
- MEDIUM: 3 or more repeated keywords found across the combination of title + short description + first 167 characters of the description.
- LOW: Duplicate keywords appear only deep in the long description (beyond the first 167 characters). Impact is minimal since deep description text carries the least indexing weight.

## Recommendations Framework

Structure your recommendations around:
- KEEP vs REMOVE: For each field, specify which keywords should stay (high-value, no overlap) and which should be removed (duplicated from a higher-weight field).
- KEYWORD REDISTRIBUTION: Explain exactly how to redistribute keywords across title, short description, and description to maximize unique keyword coverage. The goal is each field contributes NEW keywords to the app's index footprint.
- CROSS-APP PARTITIONING: When multiple apps overlap, recommend a keyword partitioning strategy where each app owns different keyword clusters based on relevance and current rank strength.
- EFFICIENCY TARGETS: Aim for less than 10% character overlap between title and short description. Both fields should be utilized at 90%+ of their character limits with unique, high-value keywords.

## Analysis Output Format

Your response must include:
- An overlap score from 0-100 (lower is better, where 0 means perfect keyword distribution with no waste)
- Wasted characters count (total characters spent on repeated keywords that provide no ranking benefit)
- Keyword redistribution suggestions (specific: move keyword X from field A to field B, replace with keyword Y)
- Priority-ranked list of changes ordered by expected ranking impact (highest impact first)

Always respond with valid JSON. No markdown fences.`;
  }

  async detect(appId: string, ctx: AgentContext): Promise<AgentResult<CannibalizationReport>> {
    this.resetTokens();
    const actions: AgentAction[] = [];

    // Fetch app and latest listing
    const [app] = await db.select().from(apps).where(eq(apps.id, appId));
    if (!app) throw new Error(`App ${appId} not found`);

    const [listing] = await db
      .select()
      .from(listingSnapshots)
      .where(eq(listingSnapshots.appId, appId))
      .orderBy(listingSnapshots.snapshotDate)
      .limit(1);

    const title = listing?.title ?? app.name;
    const shortDesc = listing?.shortDesc ?? '';
    const longDesc = listing?.longDesc ?? '';

    // 1. Title ↔ Short Description overlap
    const overlap = this.findOverlap(title, shortDesc, longDesc);

    // 2. Buried keywords
    const buried = await this.findBuriedKeywords(appId, title, shortDesc, longDesc);

    // 3. Character efficiency
    const efficiency = this.calcCharacterEfficiency(title, shortDesc);

    // 4. Cross-app cannibalization
    const crossApp = await this.findCrossAppOverlaps(appId);

    // Calculate overlap score (0-100, lower is better)
    const overlapScore = this.calcOverlapScore(overlap, buried, efficiency);

    // LLM summary
    const summaryPrompt = `Analyze this ASO cannibalization data for "${title}":

Title (${title.length}/${ANDROID_TITLE_LIMIT} chars): "${title}"
Short Description (${shortDesc.length}/${ANDROID_SHORT_DESC_LIMIT} chars): "${shortDesc}"

Overlapping words (in both title AND short desc): ${overlap.filter((o) => o.inTitle && o.inShortDesc).map((o) => o.word).join(', ') || 'none'}

Buried high-value keywords (in description but should be higher): ${buried.map((b) => `"${b.term}" (score: ${b.opportunityScore})`).join(', ') || 'none'}

Character utilization: Title ${efficiency.titleUtilization}%, Short Desc ${efficiency.shortDescUtilization}%

Cross-app keyword overlap: ${crossApp.length > 0 ? crossApp.map((c) => `"${c.keyword}" shared by ${c.apps.length} apps`).join(', ') : 'none'}

Overlap score: ${overlapScore}/100 (lower is better)

Respond as JSON: { "summary": "2-3 sentence analysis", "recommendations": ["action 1", "action 2", ...] }`;

    const llmResult = await this.chatJSON<{
      summary: string;
      recommendations: string[];
    }>(summaryPrompt, ctx);

    // Log action if significant issues found
    if (overlapScore > 30) {
      const action: AgentAction = {
        actionType: 'cannibalization_detected',
        reasoning: llmResult.summary,
        suggestedChange: llmResult.recommendations.join('\n'),
        authorityLevel: 'L1',
      };
      actions.push(action);
      await this.logAction(action, ctx);
    }

    return {
      data: {
        appName: title,
        platform: ctx.platform ?? 'android',
        titleShortDescOverlap: overlap,
        buriedKeywords: buried,
        characterEfficiency: efficiency,
        crossAppOverlaps: crossApp,
        overlapScore,
        summary: llmResult.summary,
      },
      actions,
      tokensUsed: this.getTokenUsage(),
    };
  }

  /** Find significant words that appear in both title and short description */
  private findOverlap(title: string, shortDesc: string, longDesc: string): OverlapItem[] {
    const titleWords = this.extractWords(title);
    const shortDescWords = this.extractWords(shortDesc);
    const descWords = this.extractWords(longDesc);

    const allWords = new Set([...titleWords, ...shortDescWords]);
    const items: OverlapItem[] = [];

    for (const word of allWords) {
      items.push({
        word,
        inTitle: titleWords.has(word),
        inShortDesc: shortDescWords.has(word),
        inDescription: descWords.has(word),
      });
    }

    return items.sort((a, b) => {
      const aOverlap = (a.inTitle ? 1 : 0) + (a.inShortDesc ? 1 : 0);
      const bOverlap = (b.inTitle ? 1 : 0) + (b.inShortDesc ? 1 : 0);
      return bOverlap - aOverlap;
    });
  }

  /** Find high-value keywords that are only in description but should be promoted */
  private async findBuriedKeywords(
    appId: string,
    title: string,
    shortDesc: string,
    longDesc: string,
  ): Promise<BuriedKeyword[]> {
    // Get top opportunities for this app
    const opportunities = await db
      .select({
        term: keywords.term,
        score: keywordOpportunities.opportunityScore,
      })
      .from(keywordOpportunities)
      .innerJoin(keywords, eq(keywordOpportunities.keywordId, keywords.id))
      .where(eq(keywordOpportunities.appId, appId))
      .orderBy(keywordOpportunities.opportunityScore)
      .limit(30);

    const titleLower = title.toLowerCase();
    const shortDescLower = shortDesc.toLowerCase();
    const descLower = longDesc.toLowerCase();
    const buried: BuriedKeyword[] = [];

    for (const opp of opportunities) {
      const termLower = opp.term.toLowerCase();
      const score = opp.score ?? 0;
      const inTitle = titleLower.includes(termLower);
      const inShortDesc = shortDescLower.includes(termLower);
      const inDesc = descLower.includes(termLower);

      // High-value keyword only in description (or nowhere) — should be promoted
      if (!inTitle && !inShortDesc && (inDesc || score >= 60)) {
        buried.push({
          term: opp.term,
          opportunityScore: score,
          currentPlacement: inDesc ? 'description' : 'none',
          suggestedPlacement: score >= 70 ? 'title' : 'short_description',
          reason:
            score >= 70
              ? `High opportunity score (${score}) — should be in title for maximum indexing weight`
              : `Moderate opportunity (${score}) — short description placement would improve ranking`,
        });
      }
    }

    return buried.slice(0, 10); // Top 10 buried keywords
  }

  /** Calculate character space utilization */
  private calcCharacterEfficiency(title: string, shortDesc: string): CharacterEfficiency {
    const titleUsed = title.length;
    const shortDescUsed = shortDesc.length;

    return {
      titleUsed,
      titleLimit: ANDROID_TITLE_LIMIT,
      titleUtilization: Math.round((titleUsed / ANDROID_TITLE_LIMIT) * 100),
      shortDescUsed,
      shortDescLimit: ANDROID_SHORT_DESC_LIMIT,
      shortDescUtilization: Math.round((shortDescUsed / ANDROID_SHORT_DESC_LIMIT) * 100),
      wastedTitleChars: Math.max(0, ANDROID_TITLE_LIMIT - titleUsed),
      wastedShortDescChars: Math.max(0, ANDROID_SHORT_DESC_LIMIT - shortDescUsed),
    };
  }

  /** Find keywords targeted by multiple of our apps */
  private async findCrossAppOverlaps(appId: string): Promise<CrossAppOverlap[]> {
    // Get all "ours" apps
    const ourApps = await db
      .select()
      .from(apps)
      .where(eq(apps.isOurs, true));

    if (ourApps.length < 2) return [];

    const ourAppIds = ourApps.map((a) => a.id);

    // Get all opportunities across our apps
    const allOpps = await db
      .select({
        appId: keywordOpportunities.appId,
        term: keywords.term,
        currentRank: keywordOpportunities.currentRank,
      })
      .from(keywordOpportunities)
      .innerJoin(keywords, eq(keywordOpportunities.keywordId, keywords.id))
      .where(inArray(keywordOpportunities.appId, ourAppIds));

    // Group by keyword
    const keywordMap = new Map<string, { appId: string; rank: number | null }[]>();
    for (const opp of allOpps) {
      if (!opp.appId) continue;
      const existing = keywordMap.get(opp.term) ?? [];
      existing.push({ appId: opp.appId, rank: opp.currentRank });
      keywordMap.set(opp.term, existing);
    }

    // Find keywords shared by 2+ of our apps
    const appNameMap = new Map(ourApps.map((a) => [a.id, a.name]));
    const overlaps: CrossAppOverlap[] = [];

    for (const [keyword, appEntries] of keywordMap) {
      if (appEntries.length >= 2) {
        overlaps.push({
          keyword,
          apps: appEntries.map((e) => ({
            appId: e.appId,
            name: appNameMap.get(e.appId) ?? e.appId,
            rank: e.rank,
          })),
        });
      }
    }

    return overlaps.slice(0, 20);
  }

  /** Calculate overall overlap score (0-100, lower is better) */
  private calcOverlapScore(
    overlap: OverlapItem[],
    buried: BuriedKeyword[],
    efficiency: CharacterEfficiency,
  ): number {
    // Overlapping words penalty: each overlap word = +5 points
    const overlapPenalty = Math.min(
      40,
      overlap.filter((o) => o.inTitle && o.inShortDesc).length * 5,
    );

    // Buried keywords penalty: each high-value buried keyword = +5 points
    const buriedPenalty = Math.min(30, buried.length * 5);

    // Low utilization penalty
    const utilizationPenalty = Math.round(
      (Math.max(0, 80 - efficiency.titleUtilization) +
        Math.max(0, 80 - efficiency.shortDescUtilization)) *
        0.15,
    );

    return Math.min(100, overlapPenalty + buriedPenalty + utilizationPenalty);
  }

  /** Extract significant words (3+ chars, not stop words) */
  private extractWords(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .split(/[\s\-—–:;,.|&/()[\]{}]+/)
        .filter((w) => w.length >= 3 && !STOP_WORDS.has(w)),
    );
  }
}

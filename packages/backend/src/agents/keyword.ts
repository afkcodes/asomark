import { db } from '../db/index.js';
import { apps } from '../db/schema/apps.js';
import { keywords } from '../db/schema/keywords.js';
import { keywordOpportunities } from '../db/schema/opportunities.js';
import { keywordSnapshots, keywordRelatedQueries } from '../db/schema/keyword-intelligence.js';
import { eq, and } from 'drizzle-orm';
import { PlayStoreSearchScraper } from '../scrapers/playstore/index.js';
import { GoogleSuggestScraper } from '../scrapers/google-suggest.js';
import { KeywordScorer, type KeywordScore } from '../lib/keyword-scorer.js';
import { contentAnalyzer } from '../lib/analyzer.js';
import { BaseAgent, type AgentContext, type AgentAction, type AgentResult } from './base.js';
import type { DifficultySignals } from '../lib/keyword-difficulty.js';

// ─── Types ───

export interface ScoredKeyword {
  term: string;
  searchVolumeProxy: number;  // 0-100 (from Trends + suggest position)
  relevance: number;           // 0-100 (from LLM)
  difficultyScore: number;     // 0-100 (100 = hardest, 7-signal)
  difficultyInverse: number;   // 0-100 (100 = easiest, data-driven)
  competitorGap: number;       // 0-100 (data-driven)
  trendMomentum: number;       // 0-100 (from Google Trends)
  trendDirection: 'rising' | 'falling' | 'stable';
  titleOptRate: number;        // % of top 10 with keyword in title
  difficultySignals?: DifficultySignals;
  difficultyMode?: 'fast' | 'full';
  finalScore: number;          // weighted composite 0-100
  currentRank: number | null;
  suggestedPlacement: 'title' | 'short_description' | 'description' | 'backend';
}

export interface KeywordReport {
  appName: string;
  platform: string;
  keywordsAnalyzed: number;
  topKeywords: ScoredKeyword[];
  longTailOpportunities: ScoredKeyword[];
  recommendations: string[];
  dataSources: {
    googleTrends: boolean;
    playStoreSearch: boolean;
    suggestApis: boolean;
    competitorTitles: boolean;
  };
}

// Scoring weights from PLAN.md
const WEIGHTS = {
  searchVolume: 0.30,
  relevance: 0.25,
  difficulty: 0.20,
  competitorGap: 0.15,
  trend: 0.10,
} as const;

// ─── Keyword Agent ───

export class KeywordAgent extends BaseAgent {
  readonly name = 'keyword';
  readonly description = 'Mines, scores, and prioritizes keywords for ASO using data-driven signals';

  private playSearch = new PlayStoreSearchScraper();
  private googleSuggest = new GoogleSuggestScraper();
  private scorer = new KeywordScorer();

  protected getSystemPrompt(_ctx: AgentContext): string {
    return `You are the ASOMARK Keyword Agent — a world-class ASO keyword researcher who combines data-driven analysis with deep understanding of app store search algorithms to identify, score, and prioritize keywords for maximum organic visibility.

## YOUR ROLE

You receive keywords that have already been mined from multiple sources (Play Store autocomplete, Google Suggest, competitor titles, Google Trends). Your job is NOT to guess search volume or difficulty — those are computed from real data signals. Your SOLE LLM responsibility is:

1. **Relevance scoring** (0-100): How well does this keyword match the app's actual purpose, target audience, and use case?
2. **Placement recommendation**: Where should this keyword be placed for maximum indexing impact?
3. **Strategic recommendations**: What keyword strategy opportunities exist based on the data?

## RELEVANCE SCORING METHODOLOGY

Score relevance ruthlessly — a keyword that doesn't genuinely match the app is worse than useless (it wastes character space and dilutes ranking signals).

**90-100 (Core Match)**: The keyword directly describes the app's primary function or solves its core use case. Example: "expense tracker" for a personal finance app.

**70-89 (Strong Match)**: The keyword describes a key feature or closely related use case. Example: "budget planner" for an expense tracker that also has budgeting.

**50-69 (Moderate Match)**: The keyword is in the same category but doesn't directly describe the app. Example: "savings calculator" for an expense tracker. Users searching this MIGHT want the app.

**30-49 (Weak Match)**: Tangentially related — the keyword shares a topic but the search intent doesn't align well. Example: "stock portfolio" for a basic expense tracker. Include in description only if space permits.

**0-29 (Irrelevant)**: The keyword doesn't match the app. Example: "accounting software" for a simple expense tracker. REJECT these — including them dilutes listing quality and wastes characters.

### Relevance Red Flags (auto-score below 30):
- B2B keywords for a consumer app (or vice versa)
- Keywords for a different app category entirely
- Platform-specific keywords for the wrong platform ("iOS" keywords for an Android app)
- Keywords that describe a feature the app doesn't have
- Branded keywords for competitor apps (unless explicitly targeting comparison traffic)

## PLACEMENT STRATEGY

### Title (highest indexing weight)
- **Only top 2-3 keywords deserve title placement** — this is premium real estate
- Max 50 chars (Android) / 30 chars (iOS)
- Front-load the #1 keyword as the FIRST word (or immediately after brand name)
- Use separator (dash, colon) to fit a second keyword phrase naturally
- Never waste title space on generic words ("app", "tool", "easy")
- Every character not used is a missed indexing opportunity

### Short Description (high indexing weight)
- Max 80 chars (Android) / 30 chars subtitle (iOS)
- Place here: keywords ranked 3-6 by priority that didn't fit in title
- Start with an action verb that IS a keyword ("Track expenses", "Manage budgets")
- Every single word should be either a keyword or a conversion trigger
- No period at the end — wastes a character
- NEVER repeat keywords already in the title — they're already indexed at maximum weight

### Description (medium indexing weight)
- Up to 4000 chars — ALL words indexed on Google Play
- Place here: all remaining relevant keywords
- Target 2-4% density for primary keywords (3-5 natural repetitions)
- NEVER exceed 5% density for any keyword — triggers stuffing penalty
- Use keyword variations and synonyms across the description
- Front-load top keywords in the first 167 characters (above the fold)
- Use long-tail keyword phrases as subheadings and in feature descriptions

### Backend Keywords (iOS only)
- 100 characters total, comma-separated, no spaces after commas
- Singular forms only (Apple indexes both singular and plural)
- Never repeat words already in title or subtitle — Apple deduplicates
- Focus on synonyms, misspellings, and alternative terms

## STRATEGIC ANALYSIS

When providing recommendations, consider:
- **Keyword clustering**: Group related keywords that can be targeted together (e.g., "expense tracker" + "expense tracking" + "track expenses")
- **Competitor gaps**: Keywords where competitors rank but the target app doesn't — these are the highest-priority targets
- **Trend signals**: Rising keywords deserve priority even if current volume is lower — they represent future opportunity
- **Seasonal patterns**: Flag keywords with known seasonal peaks (tax season, back-to-school, new year resolutions)
- **Intent alignment**: Transactional keywords ("download", "get", "try") convert better than informational ones — prioritize them for title/short description

## BANNED WORDS

Never recommend placing these in title or short description: "Best", "#1", "Free", "No Ads", "Top", "Number One", "Most Popular", "Cheapest" — these trigger store review flags and policy violations.

Always respond with valid JSON. No markdown fences.`;
  }

  /**
   * Mine keywords from multiple sources, score with real data, and use LLM only for relevance.
   */
  async research(appId: string, ctx: AgentContext = {}): Promise<AgentResult<KeywordReport>> {
    this.resetTokens();
    const fullCtx = { ...ctx, appId };
    const actions: AgentAction[] = [];

    // 1. Get the target app
    const [targetApp] = await db.select().from(apps).where(eq(apps.id, appId));
    if (!targetApp) throw new Error(`App ${appId} not found`);

    const platform = targetApp.platform as 'android' | 'ios';
    const region = ctx.region ?? 'us';
    const lang = 'en';

    // 2. Mine keywords from multiple sources
    const rawKeywords = new Set<string>();

    // Source 1: Alphabet soup on app name
    const nameParts = targetApp.name.split(/\s+/).filter((w) => w.length > 2);
    for (const part of nameParts.slice(0, 3)) {
      const suggestions = await this.playSearch.alphabetSoup(part.toLowerCase());
      for (const s of suggestions) rawKeywords.add(s.toLowerCase());
    }

    // Source 2: Google suggest
    for (const part of nameParts.slice(0, 3)) {
      const suggestions = await this.googleSuggest.suggest(`${part.toLowerCase()} app`);
      for (const s of suggestions) rawKeywords.add(s.toLowerCase());

      const suggestions2 = await this.googleSuggest.suggest(`best ${part.toLowerCase()}`);
      for (const s of suggestions2) rawKeywords.add(s.toLowerCase());
    }

    // Source 3: Category-based mining
    if (targetApp.category) {
      const catSuggestions = await this.playSearch.suggest(targetApp.category);
      for (const s of catSuggestions) rawKeywords.add(s.toLowerCase());
    }

    // Source 4: Play Store suggest
    const storeSuggestions = await this.playSearch.suggest(targetApp.name);
    for (const s of storeSuggestions) rawKeywords.add(s.toLowerCase());

    // Source 5: Competitor title keywords (if we have competitor data in DB)
    const competitorApps = await db
      .select()
      .from(apps)
      .where(and(eq(apps.isOurs, false), eq(apps.platform, platform)));

    const competitorTitles = competitorApps
      .map((a) => a.name)
      .filter((n) => n.length > 0);

    let commonTitleKeywords: { word: string; count: number }[] = [];
    if (competitorTitles.length > 0) {
      commonTitleKeywords = contentAnalyzer.extractCommonKeywords(competitorTitles);
      for (const { word } of commonTitleKeywords) {
        rawKeywords.add(word.toLowerCase());
      }
    }

    // 3. Filter & deduplicate
    const candidateKeywords = Array.from(rawKeywords)
      .filter((k) => k.length >= 3 && k.length <= 80)
      .slice(0, 60);

    // 4. Get ranks and search results for data-driven scoring
    const rankMap = await this.playSearch.getRanks(
      candidateKeywords.slice(0, 40),
      targetApp.packageName ?? '',
      { lang, country: region },
    );

    // 5. Score keywords with real data (in chunks to respect rate limits)
    const dataScores = new Map<string, KeywordScore>();
    const CHUNK_SIZE = 5;
    const keywordsToScore = candidateKeywords.slice(0, 40);

    for (let i = 0; i < keywordsToScore.length; i += CHUNK_SIZE) {
      const chunk = keywordsToScore.slice(i, i + CHUNK_SIZE);
      const chunkResults = await Promise.allSettled(
        chunk.map(async (kw) => {
          const searchResults = await this.playSearch.search(kw, { lang, country: region });
          const suggestResults = await this.playSearch.suggest(kw);
          const suggestPosition = suggestResults.indexOf(kw) + 1 || null;

          // Get competitor ranks for this keyword
          const compRanks: (number | null)[] = [];
          for (const result of searchResults.slice(0, 10)) {
            if (result.appId && result.appId !== targetApp.packageName) {
              const isComp = competitorApps.some((a) => a.packageName === result.appId);
              if (isComp) {
                const idx = searchResults.findIndex((r) => r.appId === result.appId);
                compRanks.push(idx >= 0 ? idx + 1 : null);
              }
            }
          }

          const score = await this.scorer.scoreKeyword(
            kw,
            searchResults,
            rankMap.get(kw) ?? null,
            compRanks,
            suggestPosition,
            { geo: region.toUpperCase() },
          );
          return score;
        }),
      );

      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          dataScores.set(result.value.term, result.value);
        }
      }
    }

    // 6. Use LLM ONLY for relevance scoring + placement suggestions + recommendations
    const keywordsForLlm = candidateKeywords.filter((k) => dataScores.has(k));
    const llmResult = await this.chatJSON<{
      keywords: Array<{
        term: string;
        relevance: number;
        suggestedPlacement: 'title' | 'short_description' | 'description' | 'backend';
      }>;
      recommendations: string[];
    }>(
      `Score the RELEVANCE of these keywords for the app "${targetApp.name}" (${platform}).
${targetApp.category ? `Category: ${targetApp.category}` : ''}

Keywords:
${JSON.stringify(keywordsForLlm)}

${commonTitleKeywords.length > 0 ? `\nCommon competitor title keywords (high priority):\n${commonTitleKeywords.map((k) => `"${k.word}" (in ${k.count} competitor titles)`).join(', ')}` : ''}

For each keyword, provide ONLY:
- relevance: 0-100 (how well does this keyword match the app's purpose and target audience?)
- suggestedPlacement: "title", "short_description", "description", or "backend"

Also provide 5 strategic recommendations.

Respond with JSON:
{
  "keywords": [{ "term": "keyword", "relevance": 85, "suggestedPlacement": "title" }],
  "recommendations": ["rec1", "rec2", ...]
}`,
      fullCtx,
      { maxTokens: 4096 },
    );

    // 7. Combine data-driven scores with LLM relevance
    const relevanceMap = new Map(llmResult.keywords.map((k) => [k.term, k]));

    const scoredKeywords: ScoredKeyword[] = [];
    for (const [term, dataScore] of dataScores) {
      const llmData = relevanceMap.get(term);
      const relevance = llmData?.relevance ?? 50;
      const suggestedPlacement = llmData?.suggestedPlacement ?? 'description';

      const finalScore =
        dataScore.searchVolumeProxy * WEIGHTS.searchVolume +
        relevance * WEIGHTS.relevance +
        dataScore.difficultyInverse * WEIGHTS.difficulty +
        dataScore.competitorGap * WEIGHTS.competitorGap +
        dataScore.trendMomentum * WEIGHTS.trend;

      scoredKeywords.push({
        term,
        searchVolumeProxy: dataScore.searchVolumeProxy,
        relevance,
        difficultyScore: dataScore.difficultyScore,
        difficultyInverse: dataScore.difficultyInverse,
        competitorGap: dataScore.competitorGap,
        trendMomentum: dataScore.trendMomentum,
        trendDirection: dataScore.trendDirection,
        titleOptRate: dataScore.titleOptRate,
        difficultySignals: dataScore.difficultySignals,
        difficultyMode: dataScore.difficultyMode,
        finalScore: Math.round(finalScore * 10) / 10,
        currentRank: rankMap.get(term) ?? null,
        suggestedPlacement,
      });
    }

    // Sort by final score
    scoredKeywords.sort((a, b) => b.finalScore - a.finalScore);

    // 8. Separate top keywords vs long-tail opportunities
    const topKeywords = scoredKeywords.filter((k) => k.finalScore >= 50);
    const longTailOpportunities = scoredKeywords.filter(
      (k) => k.finalScore < 50 && k.competitorGap >= 60,
    );

    // 9. Save keywords to DB
    for (const kw of scoredKeywords) {
      const existing = await db
        .select()
        .from(keywords)
        .where(and(eq(keywords.term, kw.term), eq(keywords.platform, platform)));

      let keywordId: string;

      if (existing.length === 0) {
        const [inserted] = await db
          .insert(keywords)
          .values({
            term: kw.term,
            platform,
            searchVolumeEst: Math.round(kw.searchVolumeProxy * 100),
            difficultyEst: kw.difficultyScore,
            difficultySignals: kw.difficultySignals ?? null,
            difficultyMode: kw.difficultyMode ?? null,
            lastUpdated: new Date(),
          })
          .returning();

        if (!inserted) continue;
        keywordId = inserted.id;

        await db.insert(keywordOpportunities).values({
          keywordId,
          appId,
          currentRank: kw.currentRank,
          potentialRank: kw.currentRank ? Math.max(1, kw.currentRank - 10) : 20,
          opportunityScore: kw.finalScore,
          suggestedAction: `Place in ${kw.suggestedPlacement}. Volume: ${kw.searchVolumeProxy}, Difficulty: ${kw.difficultyScore}, Trend: ${kw.trendDirection}`,
          createdAt: new Date(),
        });
      } else {
        keywordId = existing[0]!.id;
        await db
          .update(keywords)
          .set({
            searchVolumeEst: Math.round(kw.searchVolumeProxy * 100),
            difficultyEst: kw.difficultyScore,
            difficultySignals: kw.difficultySignals ?? null,
            difficultyMode: kw.difficultyMode ?? null,
            lastUpdated: new Date(),
          })
          .where(eq(keywords.id, keywordId));
      }

      // Save keyword snapshot for historical tracking
      const dataScore = dataScores.get(kw.term);
      const today = new Date().toISOString().split('T')[0]!;

      const [snapshot] = await db.insert(keywordSnapshots).values({
        keywordId,
        platform,
        region,
        snapshotDate: today,
        trendsInterestScore: kw.searchVolumeProxy,
        trendDirection: kw.trendDirection,
        trendsTimelineJson: dataScore?.trendsTimeline ?? null,
        topTenTitleOptRate: kw.titleOptRate,
        topTenAvgInstalls: null,
        topTenAvgRating: null,
        topTenAppIds: null,
        resultCount: null,
        difficultyScore: kw.difficultyScore,
        difficultySignals: kw.difficultySignals ?? null,
        searchVolumeProxy: kw.searchVolumeProxy,
      }).returning();

      // Save related queries from Google Trends
      if (snapshot && dataScore?.relatedQueries) {
        const { rising, top } = dataScore.relatedQueries;
        const relatedRows = [
          ...rising.slice(0, 5).map((q, i) => ({
            keywordSnapshotId: snapshot.id,
            relatedQuery: q.query,
            category: 'rising' as const,
            value: String(q.value),
            position: i + 1,
            snapshotDate: today,
          })),
          ...top.slice(0, 5).map((q, i) => ({
            keywordSnapshotId: snapshot.id,
            relatedQuery: q.query,
            category: 'top' as const,
            value: String(q.value),
            position: i + 1,
            snapshotDate: today,
          })),
        ];
        if (relatedRows.length > 0) {
          await db.insert(keywordRelatedQueries).values(relatedRows);
        }
      }
    }

    // 10. Log actions
    actions.push({
      actionType: 'keyword_mining',
      reasoning: `Mined ${rawKeywords.size} raw keywords. Scored ${scoredKeywords.length} with data-driven signals (Google Trends, search results, competitor analysis). LLM used only for relevance.`,
      suggestedChange: `Found ${topKeywords.length} high-value keywords, ${longTailOpportunities.length} long-tail opportunities`,
      authorityLevel: 'L1',
    });

    if (topKeywords.length > 0) {
      const titleKws = topKeywords.filter((k) => k.suggestedPlacement === 'title');
      if (titleKws.length > 0) {
        actions.push({
          actionType: 'title_keyword_suggestion',
          reasoning: `Top title keywords by score: ${titleKws.slice(0, 5).map((k) => `"${k.term}" (score=${k.finalScore}, volume=${k.searchVolumeProxy}, trend=${k.trendDirection})`).join(', ')}`,
          suggestedChange: `Consider adding to title: ${titleKws.slice(0, 3).map((k) => k.term).join(', ')}`,
          authorityLevel: 'L2',
        });
      }
    }

    await this.logActions(actions, fullCtx);

    const report: KeywordReport = {
      appName: targetApp.name,
      platform,
      keywordsAnalyzed: scoredKeywords.length,
      topKeywords,
      longTailOpportunities,
      recommendations: llmResult.recommendations,
      dataSources: {
        googleTrends: true,
        playStoreSearch: true,
        suggestApis: true,
        competitorTitles: commonTitleKeywords.length > 0,
      },
    };

    return { data: report, actions, tokensUsed: this.getTokenUsage() };
  }
}

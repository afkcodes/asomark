import { db } from '../db/index.js';
import { apps } from '../db/schema/apps.js';
import { keywords } from '../db/schema/keywords.js';
import { keywordOpportunities } from '../db/schema/opportunities.js';
import { keywordSnapshots, keywordRelatedQueries } from '../db/schema/keyword-intelligence.js';
import { projects, projectCompetitors } from '../db/schema/projects.js';
import { eq, and } from 'drizzle-orm';
import { PlayStoreSearchScraper } from '../scrapers/playstore/index.js';
import { KeywordScorer, type KeywordScore } from '../lib/keyword-scorer.js';
import { KeywordDiscoverer, type DiscoveredKeyword } from '../lib/discovery.js';
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
  bestCompRank: number | null;
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
    competitorDiscovery: boolean;
  };
}

// Scoring weights
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
  readonly description = 'Mines, scores, and prioritizes keywords for ASO using competitor-driven discovery and data-driven signals';

  private playSearch = new PlayStoreSearchScraper();
  private discoverer = new KeywordDiscoverer();
  private scorer = new KeywordScorer();

  protected getSystemPrompt(_ctx: AgentContext): string {
    return `You are the ASOMARK Keyword Agent — a world-class ASO keyword researcher who combines data-driven analysis with deep understanding of app store search algorithms to identify, score, and prioritize keywords for maximum organic visibility.

## YOUR ROLE

You receive keywords that have already been mined from multiple sources (competitor listing reverse-engineering, Play Store autocomplete, rank verification, Google Trends). Your job is NOT to guess search volume or difficulty — those are computed from real data signals. Your SOLE LLM responsibility is:

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
   * Mine keywords using competitor-driven discovery (rank-verified),
   * score with real data signals, and use LLM only for relevance.
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
    const myPackage = targetApp.packageName ?? '';

    // 2. Find competitors for this app (from project context)
    const competitorPackages = await this.getCompetitorPackages(appId);

    // 3. PRIMARY SOURCE: Competitor-driven, rank-verified keyword discovery
    //    This is what aso-agent does — reverse-engineer keywords from each
    //    competitor's listing, verify they actually rank, keep only verified ones.
    const discoveredMap = new Map<string, DiscoveredKeyword>();
    let commonTitleKeywords: { word: string; count: number }[] = [];

    if (competitorPackages.length > 0 && myPackage) {
      // Full competitor-driven discovery (our app + all competitors)
      const discovery = await this.discoverer.discoverFromCompetitors(
        competitorPackages,
        myPackage,
        { lang, country: region, maxKeywordsPerApp: 40 },
      );
      for (const kw of discovery.keywords) {
        discoveredMap.set(kw.keyword, kw);
      }
      commonTitleKeywords = discovery.commonTitleKeywords;
    } else if (myPackage) {
      // No competitors — discover from our own app
      const results = await this.discoverer.discover(myPackage, { lang, country: region });
      for (const r of results) {
        discoveredMap.set(r.keyword, {
          keyword: r.keyword,
          rank: r.rank,
          bestCompRank: null,
          bestCompPackage: null,
          totalResults: r.totalResults,
          difficulty: null,
          source: 'title',
        });
      }
    }

    // 4. SUPPLEMENTAL: Play Store suggest on app name (catches what discovery might miss)
    if (myPackage) {
      try {
        const storeSuggestions = await this.playSearch.suggest(targetApp.name);
        for (const s of storeSuggestions) {
          const sLower = s.toLowerCase().trim();
          if (sLower.length >= 3 && sLower.length <= 50 && !discoveredMap.has(sLower)) {
            discoveredMap.set(sLower, {
              keyword: sLower,
              rank: null,
              bestCompRank: null,
              bestCompPackage: null,
              totalResults: 0,
              difficulty: null,
              source: 'suggest',
            });
          }
        }
      } catch {
        // Continue
      }
    }

    // 5. SUPPLEMENTAL: Category-based suggest (catches category keywords)
    if (targetApp.category) {
      try {
        const catSuggestions = await this.playSearch.suggest(targetApp.category);
        for (const s of catSuggestions) {
          const sLower = s.toLowerCase().trim();
          if (sLower.length >= 3 && sLower.length <= 50 && !discoveredMap.has(sLower)) {
            discoveredMap.set(sLower, {
              keyword: sLower,
              rank: null,
              bestCompRank: null,
              bestCompPackage: null,
              totalResults: 0,
              difficulty: null,
              source: 'suggest',
            });
          }
        }
      } catch {
        // Continue
      }
    }

    // 6. Build candidate list — prioritize rank-verified keywords
    const allCandidates = Array.from(discoveredMap.values());
    // Rank-verified first (from discovery), then supplemental
    const verified = allCandidates.filter((k) => k.rank !== null || k.bestCompRank !== null);
    const unverified = allCandidates.filter((k) => k.rank === null && k.bestCompRank === null);
    const candidateKeywords = [
      ...verified.map((k) => k.keyword),
      ...unverified.map((k) => k.keyword),
    ].slice(0, 60);

    // 7. Get our ranks for keywords we don't have rank data for
    const needsRankCheck = candidateKeywords.filter((k) => {
      const d = discoveredMap.get(k);
      return d && d.rank === null;
    });
    const rankMap = new Map<string, number | null>();
    // Pre-populate from discovery data
    for (const kw of candidateKeywords) {
      const d = discoveredMap.get(kw);
      if (d && d.rank !== null) rankMap.set(kw, d.rank);
    }
    // Check remaining
    if (needsRankCheck.length > 0 && myPackage) {
      const checked = await this.playSearch.getRanks(
        needsRankCheck.slice(0, 30),
        myPackage,
        { lang, country: region },
      );
      for (const [kw, rank] of checked) {
        rankMap.set(kw, rank);
      }
    }

    // 8. Score keywords with real data (in chunks to respect rate limits)
    const dataScores = new Map<string, KeywordScore>();
    const CHUNK_SIZE = 5;
    const keywordsToScore = candidateKeywords.slice(0, 50);

    // Get competitor apps for gap analysis
    const competitorApps = await db
      .select()
      .from(apps)
      .where(and(eq(apps.isOurs, false), eq(apps.platform, platform)));

    for (let i = 0; i < keywordsToScore.length; i += CHUNK_SIZE) {
      const chunk = keywordsToScore.slice(i, i + CHUNK_SIZE);
      const chunkResults = await Promise.allSettled(
        chunk.map(async (kw) => {
          const searchResults = await this.playSearch.search(kw, { lang, country: region });
          const suggestResults = await this.playSearch.suggest(kw);
          const suggestPosition = suggestResults.indexOf(kw) + 1 || null;

          // Get competitor ranks from discovery data or search results
          const compRanks: (number | null)[] = [];
          const discovered = discoveredMap.get(kw);
          if (discovered?.bestCompRank !== null && discovered?.bestCompRank !== undefined) {
            compRanks.push(discovered.bestCompRank);
          }
          // Also check search results for known competitors
          for (const result of searchResults.slice(0, 15)) {
            if (result.appId && result.appId !== myPackage) {
              const isComp = competitorApps.some((a) => a.packageName === result.appId);
              if (isComp) {
                const idx = searchResults.findIndex((r) => r.appId === result.appId);
                if (idx >= 0) compRanks.push(idx + 1);
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

    // 9. Use LLM ONLY for relevance scoring + placement suggestions + recommendations
    const keywordsForLlm = candidateKeywords.filter((k) => dataScores.has(k));

    // Include discovery context so the LLM knows which keywords are competitor-verified
    const discoveryContext = keywordsForLlm.map((k) => {
      const d = discoveredMap.get(k);
      const myRank = rankMap.get(k);
      return {
        term: k,
        myRank: myRank ?? null,
        bestCompRank: d?.bestCompRank ?? null,
        source: d?.source ?? 'unknown',
      };
    });

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

Keywords with rank data (verified from Play Store):
${JSON.stringify(discoveryContext, null, 2)}

${commonTitleKeywords.length > 0 ? `\nCommon competitor title keywords (high priority — these words appear in multiple competitor titles):\n${commonTitleKeywords.map((k) => `"${k.word}" (in ${k.count} competitor titles)`).join(', ')}` : ''}

For each keyword, provide ONLY:
- relevance: 0-100 (how well does this keyword match the app's purpose and target audience?)
- suggestedPlacement: "title", "short_description", "description", or "backend"

Also provide 5 strategic recommendations based on the competitor gap data.

Respond with JSON:
{
  "keywords": [{ "term": "keyword", "relevance": 85, "suggestedPlacement": "title" }],
  "recommendations": ["rec1", "rec2", ...]
}`,
      fullCtx,
      { maxTokens: 4096 },
    );

    // 10. Combine data-driven scores with LLM relevance
    const relevanceMap = new Map(llmResult.keywords.map((k) => [k.term, k]));

    const scoredKeywords: ScoredKeyword[] = [];
    for (const [term, dataScore] of dataScores) {
      const llmData = relevanceMap.get(term);
      const relevance = llmData?.relevance ?? 50;
      const suggestedPlacement = llmData?.suggestedPlacement ?? 'description';
      const discovered = discoveredMap.get(term);

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
        bestCompRank: discovered?.bestCompRank ?? null,
        suggestedPlacement,
      });
    }

    // Sort by final score
    scoredKeywords.sort((a, b) => b.finalScore - a.finalScore);

    // 11. Separate top keywords vs long-tail opportunities
    const topKeywords = scoredKeywords.filter((k) => k.finalScore >= 50);
    const longTailOpportunities = scoredKeywords.filter(
      (k) => k.finalScore < 50 && k.competitorGap >= 60,
    );

    // 12. Save keywords to DB
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

    // 13. Log actions
    const verifiedCount = verified.length;
    actions.push({
      actionType: 'keyword_mining',
      reasoning: `Discovered ${discoveredMap.size} keywords (${verifiedCount} rank-verified from ${competitorPackages.length} competitors + our app). Scored ${scoredKeywords.length} with data-driven signals. LLM used only for relevance.`,
      suggestedChange: `Found ${topKeywords.length} high-value keywords, ${longTailOpportunities.length} long-tail opportunities`,
      authorityLevel: 'L1',
    });

    if (topKeywords.length > 0) {
      // Keywords where competitors rank but we don't — biggest opportunities
      const gapKeywords = topKeywords.filter((k) => k.bestCompRank !== null && k.currentRank === null);
      if (gapKeywords.length > 0) {
        actions.push({
          actionType: 'competitor_gap',
          reasoning: `Found ${gapKeywords.length} keywords where competitors rank but you don't: ${gapKeywords.slice(0, 5).map((k) => `"${k.term}" (comp #${k.bestCompRank})`).join(', ')}`,
          suggestedChange: `Target these gap keywords: ${gapKeywords.slice(0, 3).map((k) => k.term).join(', ')}`,
          authorityLevel: 'L2',
        });
      }

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
        competitorDiscovery: competitorPackages.length > 0,
      },
    };

    return { data: report, actions, tokensUsed: this.getTokenUsage() };
  }

  /**
   * Find competitor package names for an app by looking up its project.
   */
  private async getCompetitorPackages(appId: string): Promise<string[]> {
    // Find project that contains this app
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.appId, appId));

    if (!project) return [];

    // Get competitor app IDs from project_competitors
    const competitors = await db
      .select({ packageName: apps.packageName })
      .from(projectCompetitors)
      .innerJoin(apps, eq(projectCompetitors.competitorAppId, apps.id))
      .where(eq(projectCompetitors.projectId, project.id));

    return competitors
      .map((c) => c.packageName)
      .filter((p): p is string => p !== null && p.length > 0);
  }
}

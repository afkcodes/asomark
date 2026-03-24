/**
 * Data-driven keyword scoring — replaces LLM-guessed metrics
 * with signals from Google Trends, Play Store search results,
 * and actual rank comparisons.
 */
import { GoogleTrendsScraper, type RelatedQuery, type TrendPoint } from '../scrapers/google-trends.js';
import type { PlayStoreSearchResult } from '../scrapers/playstore/index.js';
import {
  KeywordDifficultyScorer,
  type DifficultyResult,
  type DifficultySignals,
} from './keyword-difficulty.js';

// ─── Types ───

export interface KeywordScore {
  term: string;
  searchVolumeProxy: number;   // 0-100 (from Trends interest + suggest position)
  difficultyScore: number;     // 0-100 (100 = hardest)
  difficultyInverse: number;   // 0-100 (100 = easiest to rank)
  competitorGap: number;       // 0-100 (100 = big opportunity)
  trendMomentum: number;       // 0-100 (100 = rapidly growing)
  trendDirection: 'rising' | 'falling' | 'stable';
  titleOptRate: number;        // % of top 10 with keyword in title
  difficultySignals?: DifficultySignals;  // 7-signal breakdown
  difficultyMode?: 'fast' | 'full';
  difficultyDetail?: DifficultyResult;    // full result for storage
  trendsTimeline?: TrendPoint[];           // full timeline for snapshot storage
  relatedQueries?: { rising: RelatedQuery[]; top: RelatedQuery[] };
}

// ─── KeywordScorer ───

export class KeywordScorer {
  private trends = new GoogleTrendsScraper();
  private difficultyScorer = new KeywordDifficultyScorer();

  /**
   * Compute search volume proxy from Google Trends interest + suggest position.
   * Trends interestScore (0-100) weighted 60%, suggest position weighted 40%.
   */
  async searchVolumeProxy(
    keyword: string,
    suggestPosition: number | null,
    opts: { geo?: string } = {},
  ): Promise<{
    score: number;
    interestScore: number;
    direction: 'rising' | 'falling' | 'stable';
    timeline: TrendPoint[];
    relatedQueries: { rising: RelatedQuery[]; top: RelatedQuery[] };
  }> {
    const [interest, relatedQueries] = await Promise.all([
      this.trends.getInterestScore(keyword, opts),
      this.trends.getRelatedQueries(keyword, opts),
    ]);

    // Suggest position: being in top-5 suggests = high volume
    // Position 1 = 100, position 5 = 60, position 10 = 30, not found = 10
    let suggestScore = 10;
    if (suggestPosition !== null && suggestPosition > 0) {
      suggestScore = Math.max(10, Math.min(100, 110 - suggestPosition * 10));
    }

    const score = Math.round(interest.interestScore * 0.6 + suggestScore * 0.4);
    return {
      score,
      interestScore: interest.interestScore,
      direction: interest.direction,
      timeline: interest.timelineData,
      relatedQueries,
    };
  }

  /**
   * Calculate keyword difficulty using 7-signal scorer (fast mode).
   * Returns backward-compatible shape plus the full signal breakdown.
   */
  difficultyFromSearchResults(
    keyword: string,
    searchResults: PlayStoreSearchResult[],
  ): {
    difficultyScore: number;
    difficultyInverse: number;
    titleOptRate: number;
    difficultySignals: DifficultySignals;
    difficultyMode: 'fast' | 'full';
    difficultyDetail: DifficultyResult;
  } {
    const result = this.difficultyScorer.scoreFast(keyword, searchResults);

    return {
      difficultyScore: result.score,
      difficultyInverse: result.inverse,
      titleOptRate: result.signals.titleOptimization,
      difficultySignals: result.signals,
      difficultyMode: result.mode,
      difficultyDetail: result,
    };
  }

  /**
   * Calculate competitor gap: how much better competitors rank vs us.
   * High gap = competitors target it but we don't = opportunity.
   */
  competitorGap(
    ourRank: number | null,
    competitorRanks: (number | null)[],
  ): number {
    const validRanks = competitorRanks.filter((r): r is number => r !== null && r > 0);
    if (validRanks.length === 0) return 50; // No data, neutral

    const avgCompetitorRank = validRanks.reduce((a, b) => a + b, 0) / validRanks.length;
    const effectiveOurRank = ourRank ?? 100; // If we're not ranked, treat as position 100

    // If competitors rank well (low number) and we don't, big gap
    // gap = how much worse we are vs competitors
    const rawGap = effectiveOurRank - avgCompetitorRank;
    return Math.max(0, Math.min(100, Math.round(rawGap)));
  }

  /**
   * Convert trend direction to a momentum score.
   */
  trendMomentumFromDirection(direction: 'rising' | 'falling' | 'stable'): number {
    switch (direction) {
      case 'rising': return 80;
      case 'stable': return 50;
      case 'falling': return 20;
    }
  }

  /**
   * Compute all data-driven scores for a keyword (except relevance, which needs LLM).
   */
  async scoreKeyword(
    keyword: string,
    searchResults: PlayStoreSearchResult[],
    ourRank: number | null,
    competitorRanks: (number | null)[],
    suggestPosition: number | null,
    opts: { geo?: string } = {},
  ): Promise<KeywordScore> {
    const volume = await this.searchVolumeProxy(keyword, suggestPosition, opts);
    const difficulty = this.difficultyFromSearchResults(keyword, searchResults);
    const gap = this.competitorGap(ourRank, competitorRanks);
    const momentum = this.trendMomentumFromDirection(volume.direction);

    return {
      term: keyword,
      searchVolumeProxy: volume.score,
      difficultyScore: difficulty.difficultyScore,
      difficultyInverse: difficulty.difficultyInverse,
      competitorGap: gap,
      trendMomentum: momentum,
      trendDirection: volume.direction,
      titleOptRate: difficulty.titleOptRate,
      difficultySignals: difficulty.difficultySignals,
      difficultyMode: difficulty.difficultyMode,
      difficultyDetail: difficulty.difficultyDetail,
      trendsTimeline: volume.timeline,
      relatedQueries: volume.relatedQueries,
    };
  }
}

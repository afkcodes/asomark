/**
 * 7-signal keyword difficulty scorer.
 *
 * Signals (all 0-100):
 *  1. Title Optimization   (0.25) — % of top 10 with keyword in title
 *  2. Install Authority     (0.20) — avg installs of top 10 (log scale)
 *  3. Rating Quality        (0.15) — avg rating × review count composite
 *  4. Result Saturation     (0.10) — total results / 250
 *  5. Top App Dominance     (0.10) — install gap between #1 and #10
 *  6. Description Opt       (0.10) — % of top 10 with keyword in short desc
 *  7. Developer Diversity   (0.10) — unique devs in top 10
 *
 * Two modes:
 *  - scoreFast: uses ParsedSearchResult only (signals 1,2,4,5,7)
 *  - scoreFull: also uses ParsedAppDetails for signals 3 (review count) and 6
 */

import type { ParsedSearchResult } from '../scrapers/playstore/parser.js';
import type { ParsedAppDetails } from '../scrapers/playstore/parser.js';

// ─── Types ───

export interface DifficultySignals {
  titleOptimization: number;
  installAuthority: number;
  ratingQuality: number;
  resultSaturation: number;
  topAppDominance: number;
  descriptionOptimization: number;
  developerDiversity: number;
}

export interface DifficultyWeights {
  titleOptimization: number;
  installAuthority: number;
  ratingQuality: number;
  resultSaturation: number;
  topAppDominance: number;
  descriptionOptimization: number;
  developerDiversity: number;
}

export interface DifficultyResult {
  score: number;          // 0-100 (100 = hardest)
  inverse: number;        // 0-100 (100 = easiest)
  signals: DifficultySignals;
  weights: DifficultyWeights;
  mode: 'fast' | 'full';
  metadata: {
    topAppsAnalyzed: number;
    avgInstalls: number;
    avgRating: number;
    avgReviewCount: number | null; // null in fast mode
    totalResults: number;
    uniqueDevelopers: number;
    topInstallGap: number;
  };
}

export interface AppSpecificDifficultyResult extends DifficultyResult {
  appSpecificScore: number;  // 0-100 adjusted for this app
  appRelevancePenalty: number;
  appAuthorityBonus: number;
}

// ─── Constants ───

const DEFAULT_WEIGHTS: DifficultyWeights = {
  titleOptimization: 0.25,
  installAuthority: 0.20,
  ratingQuality: 0.15,
  resultSaturation: 0.10,
  topAppDominance: 0.10,
  descriptionOptimization: 0.10,
  developerDiversity: 0.10,
};

// Fast mode skips descriptionOptimization — redistribute its weight
const FAST_WEIGHTS: DifficultyWeights = {
  titleOptimization: 0.28,
  installAuthority: 0.22,
  ratingQuality: 0.18,
  resultSaturation: 0.12,
  topAppDominance: 0.10,
  descriptionOptimization: 0,   // not available in fast mode
  developerDiversity: 0.10,
};

const MAX_INSTALLS = 1_000_000_000; // 1B
const MAX_RESULTS = 250;
const MAX_INSTALL_GAP = 10_000;
const MAX_REVIEW_COUNT = 1_000_000;

// ─── KeywordDifficultyScorer ───

export class KeywordDifficultyScorer {
  /**
   * Parse Play Store install text ("1,000,000+") to a number.
   */
  static parseInstalls(text: string): number {
    if (!text) return 0;
    const cleaned = text.replace(/[+,\s]/g, '').trim();
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Fast scoring — uses only ParsedSearchResult (no detail fetches).
   * Computes 6 of 7 signals (skips descriptionOptimization).
   * ratingQuality uses only the score field (no review count).
   */
  scoreFast(
    keyword: string,
    searchResults: ParsedSearchResult[],
    weights: DifficultyWeights = FAST_WEIGHTS,
  ): DifficultyResult {
    const top10 = searchResults.slice(0, 10);

    if (top10.length === 0) {
      return this.emptyResult('fast', weights);
    }

    const signals = {
      titleOptimization: this.calcTitleOptimization(keyword, top10),
      installAuthority: this.calcInstallAuthority(top10),
      ratingQuality: this.calcRatingQualityFast(top10),
      resultSaturation: this.calcResultSaturation(searchResults.length),
      topAppDominance: this.calcTopAppDominance(top10),
      descriptionOptimization: 0,
      developerDiversity: this.calcDeveloperDiversity(top10),
    };

    const score = this.computeWeightedScore(signals, weights);
    const installs = top10.map((r) => KeywordDifficultyScorer.parseInstalls(r.installs));
    const avgInstalls = installs.reduce((a, b) => a + b, 0) / installs.length;

    return {
      score,
      inverse: 100 - score,
      signals,
      weights,
      mode: 'fast',
      metadata: {
        topAppsAnalyzed: top10.length,
        avgInstalls: Math.round(avgInstalls),
        avgRating: this.avgRating(top10),
        avgReviewCount: null,
        totalResults: searchResults.length,
        uniqueDevelopers: new Set(top10.map((r) => r.developer.toLowerCase())).size,
        topInstallGap: this.installGap(top10),
      },
    };
  }

  /**
   * Full scoring — uses both ParsedSearchResult AND ParsedAppDetails.
   * All 7 signals computed including review count and description matching.
   */
  scoreFull(
    keyword: string,
    searchResults: ParsedSearchResult[],
    appDetails: ParsedAppDetails[],
    weights: DifficultyWeights = DEFAULT_WEIGHTS,
  ): DifficultyResult {
    const top10 = searchResults.slice(0, 10);

    if (top10.length === 0) {
      return this.emptyResult('full', weights);
    }

    // Build a map of appId → details for quick lookup
    const detailsMap = new Map(appDetails.map((d) => [d.appId, d]));

    const signals = {
      titleOptimization: this.calcTitleOptimization(keyword, top10),
      installAuthority: this.calcInstallAuthority(top10),
      ratingQuality: this.calcRatingQualityFull(top10, detailsMap),
      resultSaturation: this.calcResultSaturation(searchResults.length),
      topAppDominance: this.calcTopAppDominance(top10),
      descriptionOptimization: this.calcDescriptionOptimization(keyword, top10, detailsMap),
      developerDiversity: this.calcDeveloperDiversity(top10),
    };

    const score = this.computeWeightedScore(signals, weights);
    const installs = top10.map((r) => KeywordDifficultyScorer.parseInstalls(r.installs));
    const avgInstalls = installs.reduce((a, b) => a + b, 0) / installs.length;

    // Average review count from details
    const reviewCounts = top10
      .map((r) => detailsMap.get(r.appId)?.ratings)
      .filter((r): r is number => r !== undefined && r > 0);
    const avgReviewCount =
      reviewCounts.length > 0
        ? Math.round(reviewCounts.reduce((a, b) => a + b, 0) / reviewCounts.length)
        : null;

    return {
      score,
      inverse: 100 - score,
      signals,
      weights,
      mode: 'full',
      metadata: {
        topAppsAnalyzed: top10.length,
        avgInstalls: Math.round(avgInstalls),
        avgRating: this.avgRating(top10),
        avgReviewCount,
        totalResults: searchResults.length,
        uniqueDevelopers: new Set(top10.map((r) => r.developer.toLowerCase())).size,
        topInstallGap: this.installGap(top10),
      },
    };
  }

  /**
   * App-specific difficulty: adjusts generic difficulty based on
   * how relevant the keyword is for the app and the app's authority.
   */
  scoreForApp(
    genericResult: DifficultyResult,
    relevanceScore: number,        // 0-100, from LLM
    ourInstalls: number,           // our app's install count
  ): AppSpecificDifficultyResult {
    const topInstalls = genericResult.metadata.avgInstalls;

    // Irrelevant app faces up to 50% higher difficulty
    const appRelevancePenalty = 1.0 + (1.0 - relevanceScore / 100) * 0.5;

    // Our install count vs top results — more installs = easier to rank
    // Capped at 0.5 (50% reduction) — still need optimization
    let appAuthorityBonus = 1.0;
    if (topInstalls > 0 && ourInstalls > 0) {
      appAuthorityBonus = Math.max(
        0.5,
        1.0 - (Math.log10(ourInstalls) / Math.log10(Math.max(10, topInstalls))) * 0.3,
      );
    }

    const appSpecificScore = Math.round(
      Math.min(100, Math.max(0, genericResult.score * appRelevancePenalty * appAuthorityBonus)),
    );

    return {
      ...genericResult,
      appSpecificScore,
      appRelevancePenalty: Math.round(appRelevancePenalty * 100) / 100,
      appAuthorityBonus: Math.round(appAuthorityBonus * 100) / 100,
    };
  }

  // ─── Signal Calculations ───

  /**
   * Signal 1: Title Optimization Density
   * % of top 10 that have the keyword (or significant words) in their title.
   * Multi-word keywords: all words 3+ chars must match for full credit,
   * partial matches get 0.5 credit.
   */
  private calcTitleOptimization(
    keyword: string,
    top10: ParsedSearchResult[],
  ): number {
    const words = keyword
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 3);

    if (words.length === 0) return 0;

    let matchScore = 0;
    for (const result of top10) {
      const titleLower = (result.title ?? '').toLowerCase();
      const matchedWords = words.filter((w) => titleLower.includes(w));

      if (matchedWords.length === words.length) {
        matchScore += 1;         // full match
      } else if (matchedWords.length > 0) {
        matchScore += 0.5;       // partial match
      }
    }

    return Math.round((matchScore / top10.length) * 100);
  }

  /**
   * Signal 2: Install Authority
   * Average installs of top 10 on a log10 scale.
   * 1K avg → ~33, 100K → ~56, 1M → ~67, 10M → ~78, 100M → ~89, 1B → 100
   */
  private calcInstallAuthority(top10: ParsedSearchResult[]): number {
    const installs = top10.map((r) => KeywordDifficultyScorer.parseInstalls(r.installs));
    const validInstalls = installs.filter((i) => i > 0);

    if (validInstalls.length === 0) return 20;

    const avg = validInstalls.reduce((a, b) => a + b, 0) / validInstalls.length;
    return Math.round(Math.min(100, (Math.log10(Math.max(1, avg)) / Math.log10(MAX_INSTALLS)) * 100));
  }

  /**
   * Signal 3 (fast): Rating Quality — uses only score field.
   * Normalized from 2.0-5.0 range.
   */
  private calcRatingQualityFast(top10: ParsedSearchResult[]): number {
    const ratings = top10.map((r) => r.score).filter((s) => s > 0);
    if (ratings.length === 0) return 50;

    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    return Math.round(Math.max(0, Math.min(100, ((avg - 2.0) / 3.0) * 100)));
  }

  /**
   * Signal 3 (full): Rating Quality — uses rating (40%) + review count (60%).
   * High review count = more established = harder to displace.
   */
  private calcRatingQualityFull(
    top10: ParsedSearchResult[],
    detailsMap: Map<string, ParsedAppDetails>,
  ): number {
    const ratings = top10.map((r) => r.score).filter((s) => s > 0);
    if (ratings.length === 0) return 50;

    const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    const ratingComponent = Math.max(0, Math.min(100, ((avgRating - 2.0) / 3.0) * 100));

    // Review count component
    const reviewCounts = top10
      .map((r) => detailsMap.get(r.appId)?.ratings)
      .filter((r): r is number => r !== undefined && r > 0);

    if (reviewCounts.length === 0) {
      return Math.round(ratingComponent);
    }

    const avgReviews = reviewCounts.reduce((a, b) => a + b, 0) / reviewCounts.length;
    const reviewComponent = Math.min(
      100,
      (Math.log10(Math.max(1, avgReviews)) / Math.log10(MAX_REVIEW_COUNT)) * 100,
    );

    return Math.round(ratingComponent * 0.4 + reviewComponent * 0.6);
  }

  /**
   * Signal 4: Result Saturation
   * Total results returned normalized against max (~250).
   */
  private calcResultSaturation(totalResults: number): number {
    return Math.round(Math.min(100, (totalResults / MAX_RESULTS) * 100));
  }

  /**
   * Signal 5: Top App Dominance
   * Install gap between #1 and #10 result (log scale).
   * Big gap = dominant player monopolizes keyword.
   */
  private calcTopAppDominance(top10: ParsedSearchResult[]): number {
    if (top10.length < 2) return 50;

    const first = KeywordDifficultyScorer.parseInstalls(top10[0]!.installs);
    const last = KeywordDifficultyScorer.parseInstalls(top10[top10.length - 1]!.installs);

    if (last <= 0 || first <= 0) return 50;

    const gap = first / last;
    return Math.round(
      Math.min(100, (Math.log10(Math.max(1, gap)) / Math.log10(MAX_INSTALL_GAP)) * 100),
    );
  }

  /**
   * Signal 6: Description Optimization (full mode only)
   * % of top 10 with keyword in their short description.
   */
  private calcDescriptionOptimization(
    keyword: string,
    top10: ParsedSearchResult[],
    detailsMap: Map<string, ParsedAppDetails>,
  ): number {
    const words = keyword
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 3);

    if (words.length === 0) return 0;

    let matchCount = 0;
    for (const result of top10) {
      const details = detailsMap.get(result.appId);
      if (!details) continue;

      const descLower = (details.shortDescription ?? '').toLowerCase();
      const hasMatch = words.some((w) => descLower.includes(w));
      if (hasMatch) matchCount++;
    }

    return Math.round((matchCount / top10.length) * 100);
  }

  /**
   * Signal 7: Developer Diversity
   * Unique developer names in top 10 / total.
   * More unique devs = more organic competition = harder.
   */
  private calcDeveloperDiversity(top10: ParsedSearchResult[]): number {
    const devs = new Set(
      top10.map((r) => (r.developer ?? '').toLowerCase().trim()).filter((d) => d.length > 0),
    );
    return Math.round((devs.size / Math.max(1, top10.length)) * 100);
  }

  // ─── Helpers ───

  private computeWeightedScore(signals: DifficultySignals, weights: DifficultyWeights): number {
    const raw =
      signals.titleOptimization * weights.titleOptimization +
      signals.installAuthority * weights.installAuthority +
      signals.ratingQuality * weights.ratingQuality +
      signals.resultSaturation * weights.resultSaturation +
      signals.topAppDominance * weights.topAppDominance +
      signals.descriptionOptimization * weights.descriptionOptimization +
      signals.developerDiversity * weights.developerDiversity;

    return Math.round(Math.min(100, Math.max(0, raw)));
  }

  private avgRating(top10: ParsedSearchResult[]): number {
    const ratings = top10.map((r) => r.score).filter((s) => s > 0);
    if (ratings.length === 0) return 0;
    return Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100;
  }

  private installGap(top10: ParsedSearchResult[]): number {
    if (top10.length < 2) return 0;
    const first = KeywordDifficultyScorer.parseInstalls(top10[0]!.installs);
    const last = KeywordDifficultyScorer.parseInstalls(top10[top10.length - 1]!.installs);
    return last > 0 ? Math.round(first / last) : 0;
  }

  private emptyResult(mode: 'fast' | 'full', weights: DifficultyWeights): DifficultyResult {
    return {
      score: 15,
      inverse: 85,
      signals: {
        titleOptimization: 0,
        installAuthority: 0,
        ratingQuality: 0,
        resultSaturation: 0,
        topAppDominance: 0,
        descriptionOptimization: 0,
        developerDiversity: 0,
      },
      weights,
      mode,
      metadata: {
        topAppsAnalyzed: 0,
        avgInstalls: 0,
        avgRating: 0,
        avgReviewCount: null,
        totalResults: 0,
        uniqueDevelopers: 0,
        topInstallGap: 0,
      },
    };
  }
}

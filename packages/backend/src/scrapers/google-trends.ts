/**
 * Google Trends scraper using the google-trends-api package.
 * Provides per-keyword interest scores, trend direction, and related queries.
 */
import googleTrends from 'google-trends-api';
import { BaseScraper } from './base.js';

// ─── Types ───

export interface TrendPoint {
  date: string;
  value: number;
}

export interface TrendInterest {
  /** Average interest score over last 7 days (0-100) */
  interestScore: number;
  /** Trend direction based on first-half vs second-half comparison */
  direction: 'rising' | 'falling' | 'stable';
  /** Raw timeline data points */
  timelineData: TrendPoint[];
}

export interface RelatedQuery {
  query: string;
  value: string | number;
}

export interface TrendData extends TrendInterest {
  keyword: string;
  relatedQueries: {
    rising: RelatedQuery[];
    top: RelatedQuery[];
  };
}

// ─── GoogleTrendsScraper ───

export class GoogleTrendsScraper extends BaseScraper {
  constructor() {
    super({ concurrency: 1, intervalMs: 2000, cacheTtlSeconds: 43200 }); // 12h cache
  }

  /** Get interest over time for a keyword (last 90 days). */
  async getInterestOverTime(
    keyword: string,
    opts: { geo?: string } = {},
  ): Promise<TrendPoint[]> {
    const { geo = 'US' } = opts;

    return this.cached(`trends:interest:${keyword}:${geo}`, () =>
      this.enqueue(async () => {
        try {
          const result = await googleTrends.interestOverTime({
            keyword,
            geo: geo.toUpperCase(),
            startTime: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
          });

          const data = JSON.parse(result) as {
            default: {
              timelineData: Array<{
                formattedTime: string;
                value: number[];
              }>;
            };
          };

          if (!data.default?.timelineData) return [];

          return data.default.timelineData.map((item) => ({
            date: item.formattedTime,
            value: item.value[0] ?? 0,
          }));
        } catch {
          return [];
        }
      }),
    );
  }

  /**
   * Get interest score and trend direction for a keyword.
   * interestScore = average of last 7 data points (0-100)
   * direction = compare first-half vs second-half (>10% delta = rising/falling)
   */
  async getInterestScore(
    keyword: string,
    opts: { geo?: string } = {},
  ): Promise<TrendInterest> {
    const timelineData = await this.getInterestOverTime(keyword, opts);

    if (timelineData.length === 0) {
      return { interestScore: 0, direction: 'stable', timelineData: [] };
    }

    // Current interest = average of last 7 points
    const recentValues = timelineData.slice(-7).map((d) => d.value);
    const interestScore =
      recentValues.length > 0
        ? Math.round(recentValues.reduce((a, b) => a + b, 0) / recentValues.length)
        : 0;

    // Direction: compare first-half average vs second-half average
    let direction: 'rising' | 'falling' | 'stable' = 'stable';
    if (timelineData.length >= 14) {
      const firstHalf = timelineData.slice(0, 7).map((d) => d.value);
      const secondHalf = timelineData.slice(-7).map((d) => d.value);
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      if (firstAvg > 0) {
        if (secondAvg > firstAvg * 1.1) direction = 'rising';
        else if (secondAvg < firstAvg * 0.9) direction = 'falling';
      }
    }

    return { interestScore, direction, timelineData };
  }

  /** Get related queries (rising + top) for a keyword. */
  async getRelatedQueries(
    keyword: string,
    opts: { geo?: string } = {},
  ): Promise<{ rising: RelatedQuery[]; top: RelatedQuery[] }> {
    const { geo = 'US' } = opts;

    return this.cached(`trends:related:${keyword}:${geo}`, () =>
      this.enqueue(async () => {
        try {
          const result = await googleTrends.relatedQueries({
            keyword,
            geo: geo.toUpperCase(),
          });

          const data = JSON.parse(result) as {
            default: {
              rankedList: Array<{
                rankedKeyword: Array<{
                  query: string;
                  value: number;
                  formattedValue?: string;
                }>;
              }>;
            };
          };

          const risingList = data.default?.rankedList?.[0]?.rankedKeyword ?? [];
          const topList = data.default?.rankedList?.[1]?.rankedKeyword ?? [];

          return {
            rising: risingList.map((item) => ({
              query: item.query,
              value: item.formattedValue ?? `+${item.value}%`,
            })),
            top: topList.map((item) => ({
              query: item.query,
              value: item.value,
            })),
          };
        } catch {
          return { rising: [], top: [] };
        }
      }),
    );
  }

  /** Get full trend data: interest score + direction + related queries. */
  async getFullTrendData(
    keyword: string,
    opts: { geo?: string } = {},
  ): Promise<TrendData> {
    const [interest, relatedQueries] = await Promise.all([
      this.getInterestScore(keyword, opts),
      this.getRelatedQueries(keyword, opts),
    ]);

    return {
      keyword,
      ...interest,
      relatedQueries,
    };
  }
}

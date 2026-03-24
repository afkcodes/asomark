declare module 'google-trends-api' {
  interface TrendOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
    timezone?: number;
    category?: number;
  }

  export function interestOverTime(options: TrendOptions): Promise<string>;
  export function relatedQueries(options: TrendOptions): Promise<string>;
  export function relatedTopics(options: TrendOptions): Promise<string>;
  export function dailyTrends(options: { geo: string; trendDate?: Date }): Promise<string>;
}

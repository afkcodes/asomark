import { request } from 'undici';
import { BaseScraper, randomUserAgent } from '../base.js';
import { extractDataBlocks, parseReviews } from './parser.js';
import { PlayStoreBatchReviewsScraper, type ReviewSort } from './reviews-batch.js';
import { gplayReviews, GplaySort } from './gplay.js';
import type { ParsedReview } from './parser.js';

export type { ParsedReview as PlayStoreReview };

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details';

const SORT_TO_GPLAY: Record<ReviewSort, number> = {
  newest: GplaySort.NEWEST,
  relevance: GplaySort.HELPFULNESS,
  rating: GplaySort.RATING,
};

export class PlayStoreReviewsScraper extends BaseScraper {
  private batchScraper = new PlayStoreBatchReviewsScraper();

  constructor() {
    super({ concurrency: 1, intervalMs: 2000, cacheTtlSeconds: 7200 });
  }

  /**
   * Get reviews — tries sources in order:
   * 1. google-play-scraper (community-maintained, handles structure changes)
   * 2. batchexecute API (our own implementation, supports pagination)
   * 3. HTML parsing fallback (limited to ~20-40 reviews)
   */
  async getReviews(
    packageName: string,
    opts: {
      num?: number;
      sort?: ReviewSort;
      lang?: string;
      country?: string;
    } = {},
  ): Promise<ParsedReview[]> {
    const { num = 100, sort = 'newest', lang = 'en', country = 'us' } = opts;

    // Primary: google-play-scraper
    try {
      const { data } = await gplayReviews(packageName, {
        num,
        sort: SORT_TO_GPLAY[sort],
        lang,
        country,
      });
      if (data.length > 0) {
        return data.map((r) => ({
          id: r.id,
          userName: r.userName,
          userImage: r.userImage,
          date: r.date,
          score: r.score,
          text: r.text,
          thumbsUp: r.thumbsUp,
          version: r.version,
          replyText: r.replyText,
          replyDate: r.replyDate,
        }));
      }
    } catch {
      // fall through
    }

    // Fallback: batchexecute API
    try {
      const reviews = await this.batchScraper.getReviews(packageName, { num, sort, lang, country });
      if (reviews.length > 0) return reviews;
    } catch {
      // Fall through to HTML parsing
    }

    // Last resort: HTML detail page parsing (limited to ~20-40 reviews)
    return this.getReviewsFromHtml(packageName, { num, lang, country });
  }

  /** Get reviews by scraping the detail page HTML (fallback, limited to ~20-40). */
  async getReviewsFromHtml(
    packageName: string,
    opts: { num?: number; lang?: string; country?: string } = {},
  ): Promise<ParsedReview[]> {
    const { num = 40, lang = 'en', country = 'us' } = opts;

    return this.cached(
      `playstore:reviews-html:${packageName}:${num}:${lang}:${country}`,
      () =>
        this.enqueue(async () => {
          const url = `${PLAY_STORE_URL}?id=${encodeURIComponent(packageName)}&hl=${lang}&gl=${country}`;
          const { body, statusCode } = await request(url, {
            headers: { 'User-Agent': randomUserAgent() },
          });
          const html = await body.text();
          if (statusCode !== 200) {
            throw new Error(`Play Store returned ${statusCode} for ${packageName}`);
          }

          const blocks = extractDataBlocks(html);
          const reviews = parseReviews(blocks);
          return reviews.slice(0, num);
        }),
    );
  }

  /** Get reviews filtered by rating */
  async getReviewsByRating(
    packageName: string,
    rating: number,
    opts: { num?: number; lang?: string; country?: string } = {},
  ): Promise<ParsedReview[]> {
    const reviews = await this.getReviews(packageName, opts);
    return reviews.filter((r) => r.score === rating);
  }

  /** Get the most recent negative reviews (1-2 stars) for pain point mining */
  async getNegativeReviews(
    packageName: string,
    opts: { num?: number; lang?: string; country?: string } = {},
  ): Promise<ParsedReview[]> {
    const num = opts.num ?? 50;
    // Fetch more since we filter
    const reviews = await this.getReviews(packageName, {
      num: num * 3,
      sort: 'rating',
      lang: opts.lang,
      country: opts.country,
    });
    return reviews.filter((r) => r.score <= 2).slice(0, num);
  }
}

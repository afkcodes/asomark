/**
 * Paginated Play Store review scraper using the internal batchexecute API.
 * Fetches 100-200+ reviews with pagination — far more than the ~20-40 from HTML parsing.
 */
import { request } from 'undici';
import { BaseScraper, randomUserAgent } from '../base.js';
import type { ParsedReview } from './parser.js';

const BATCH_URL = 'https://play.google.com/_/PlayStoreUi/data/batchexecute';
const RPC_ID = 'UsvDTd';
const MAX_REQUESTS = 50; // safety cap to prevent runaway loops

/** Sort options for Play Store reviews */
export type ReviewSort = 'newest' | 'relevance' | 'rating';

const SORT_MAP: Record<ReviewSort, number> = {
  newest: 2,
  relevance: 1,
  rating: 3,
};

export class PlayStoreBatchReviewsScraper extends BaseScraper {
  constructor() {
    super({ concurrency: 1, intervalMs: 1000, cacheTtlSeconds: 7200 });
  }

  /**
   * Fetch reviews via the batchexecute API with pagination.
   * Returns up to `limit` reviews sorted by the given sort option.
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
    const cacheKey = `playstore:reviews-batch:${packageName}:${num}:${sort}:${lang}:${country}`;

    return this.cached(cacheKey, () =>
      this.enqueue(async () => {
        const sortType = SORT_MAP[sort];
        const reviews: ParsedReview[] = [];
        let nextToken: string | null = null;
        let requestCount = 0;

        while (reviews.length < num && requestCount < MAX_REQUESTS) {
          const batchSize = Math.min(num - reviews.length, 100);

          // Build the inner payload:
          // [null, null, [sortType, null, [batchSize, token, null], null, []], [appId, 7]]
          const innerPayload = JSON.stringify([
            null,
            null,
            [sortType, null, [batchSize, nextToken, null], null, []],
            [packageName, 7],
          ]);

          const formBody = new URLSearchParams();
          formBody.append('f.req', JSON.stringify([[[RPC_ID, innerPayload, null, 'generic']]]));

          const { body, statusCode } = await request(BATCH_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
              'User-Agent': randomUserAgent(),
              'Accept-Language': `${lang}-${country.toUpperCase()},${lang};q=0.9`,
            },
            body: formBody.toString(),
          });

          const rawText = await body.text();
          if (statusCode !== 200) break;

          try {
            // Strip XSSI prefix ")]}'
            const cleanText = rawText.replace(/^\)\]\}'/, '').trim();
            // Response is a nested array: first line is length prefix, parse the outer array
            const lines = cleanText.split('\n').filter((l) => l.trim());
            // Find the JSON line (skip numeric length prefixes)
            let parsed: unknown[] | null = null;
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('[')) {
                try {
                  parsed = JSON.parse(trimmed) as unknown[];
                  break;
                } catch {
                  // not this line
                }
              }
            }

            if (!parsed) break;

            // Navigate to the review data
            const outerPayload = (parsed as unknown[][])[0]?.[2];
            if (!outerPayload || typeof outerPayload !== 'string') break;

            const innerData = JSON.parse(outerPayload) as unknown[][];
            const reviewList = innerData[0];
            if (!Array.isArray(reviewList) || reviewList.length === 0) break;

            // Extract each review
            for (const r of reviewList) {
              const review = r as unknown[];
              const id = review[0] as string | undefined;
              const userName = (review[1] as unknown[])?.[0] as string | undefined;
              const userImageData = (review[1] as unknown[])?.[1] as unknown[] | undefined;
              const userImage = (userImageData?.[3] as unknown[] | undefined)?.[2] as string | undefined;
              const score = review[2] as number | undefined;
              const text = review[4] as string | undefined;
              const thumbsUp = review[6] as number | undefined;
              const version = review[10] as string | undefined;
              const replyText = (review[7] as unknown[])?.[1] as string | undefined;

              // Timestamp is in seconds (review[5]) — convert to date strings
              const dateTs = (review[5] as unknown[])?.[0] as number | undefined;
              const replyDateTs = (review[7] as unknown[])?.[2] as number | undefined;

              if (typeof score !== 'number') continue;

              reviews.push({
                id: id ?? `${packageName}-${reviews.length}`,
                userName: userName ?? 'Anonymous',
                userImage,
                date: dateTs ? new Date(dateTs * 1000).toISOString() : new Date().toISOString(),
                score,
                text: text ?? '',
                thumbsUp: thumbsUp ?? 0,
                version,
                replyText,
                replyDate: replyDateTs ? new Date(replyDateTs * 1000).toISOString() : undefined,
              });
            }

            // Check for pagination token
            if (
              Array.isArray(innerData[1]) &&
              typeof innerData[1][1] === 'string'
            ) {
              nextToken = innerData[1][1] as string;
            } else {
              nextToken = null;
            }

            if (!nextToken) break;
            requestCount++;

            // Small delay between pagination requests
            await new Promise((r) => setTimeout(r, 500));
          } catch {
            break;
          }
        }

        return reviews.slice(0, num);
      }),
    );
  }

  /** Get only negative reviews (1-2 stars) — useful for pain point mining. */
  async getNegativeReviews(
    packageName: string,
    opts: { num?: number; lang?: string; country?: string } = {},
  ): Promise<ParsedReview[]> {
    const reviews = await this.getReviews(packageName, {
      num: (opts.num ?? 50) * 3, // fetch more since we filter
      sort: 'rating',
      lang: opts.lang,
      country: opts.country,
    });
    return reviews.filter((r) => r.score <= 2).slice(0, opts.num ?? 50);
  }

  /** Get only 5-star reviews — useful for understanding what users love. */
  async getPositiveReviews(
    packageName: string,
    opts: { num?: number; lang?: string; country?: string } = {},
  ): Promise<ParsedReview[]> {
    const reviews = await this.getReviews(packageName, {
      num: (opts.num ?? 50) * 2,
      sort: 'relevance',
      lang: opts.lang,
      country: opts.country,
    });
    return reviews.filter((r) => r.score === 5).slice(0, opts.num ?? 50);
  }
}

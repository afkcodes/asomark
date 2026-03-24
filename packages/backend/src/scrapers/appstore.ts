import { request } from 'undici';
import * as cheerio from 'cheerio';
import { BaseScraper, randomUserAgent } from './base.js';

export interface AppStoreAppDetails {
  trackId: number;
  bundleId: string;
  trackName: string;
  artistName: string;
  description: string;
  genres: string[];
  primaryGenreName: string;
  price: number;
  averageUserRating: number;
  userRatingCount: number;
  artworkUrl512: string;
  screenshotUrls: string[];
  ipadScreenshotUrls: string[];
  releaseNotes: string;
  version: string;
  currentVersionReleaseDate: string;
  contentAdvisoryRating: string;
  trackViewUrl: string;
  minimumOsVersion: string;
  fileSizeBytes: string;
}

export interface AppStoreSearchResult {
  trackId: number;
  bundleId: string;
  trackName: string;
  artistName: string;
  description: string;
  primaryGenreName: string;
  averageUserRating: number;
  userRatingCount: number;
  artworkUrl512: string;
  price: number;
  trackViewUrl: string;
}

export class AppStoreScraper extends BaseScraper {
  private baseUrl = 'https://itunes.apple.com';

  constructor() {
    super({ concurrency: 1, intervalMs: 1000, cacheTtlSeconds: 3600 });
  }

  /** Search App Store via iTunes Search API */
  async search(
    term: string,
    opts: { country?: string; limit?: number } = {},
  ): Promise<AppStoreSearchResult[]> {
    const { country = 'us', limit = 50 } = opts;

    return this.cached(`appstore:search:${term}:${country}:${limit}`, () =>
      this.enqueue(async () => {
        const url = `${this.baseUrl}/search?term=${encodeURIComponent(term)}&country=${country}&media=software&limit=${limit}`;
        const { body } = await request(url, {
          headers: { 'User-Agent': randomUserAgent() },
        });
        const data = (await body.json()) as { results: AppStoreSearchResult[] };
        return data.results;
      }),
    );
  }

  /** Look up app by bundle ID or track ID */
  async lookup(
    id: string | number,
    opts: { country?: string } = {},
  ): Promise<AppStoreAppDetails | null> {
    const { country = 'us' } = opts;
    const param = typeof id === 'number' ? `id=${id}` : `bundleId=${id}`;

    return this.cached(`appstore:lookup:${id}:${country}`, () =>
      this.enqueue(async () => {
        const url = `${this.baseUrl}/lookup?${param}&country=${country}`;
        const { body } = await request(url, {
          headers: { 'User-Agent': randomUserAgent() },
        });
        const data = (await body.json()) as { results: AppStoreAppDetails[] };
        return data.results[0] ?? null;
      }),
    );
  }

  /** Get multiple apps by their IDs */
  async bulkLookup(
    ids: (string | number)[],
    opts: { country?: string } = {},
  ): Promise<AppStoreAppDetails[]> {
    const results = await Promise.allSettled(
      ids.map((id) => this.lookup(id, opts)),
    );

    return results
      .filter(
        (r): r is PromiseFulfilledResult<AppStoreAppDetails | null> =>
          r.status === 'fulfilled' && r.value !== null,
      )
      .map((r) => r.value!);
  }

  /** Get rank of a specific app for a keyword */
  async getRank(
    term: string,
    bundleId: string,
    opts: { country?: string } = {},
  ): Promise<number | null> {
    const results = await this.search(term, { ...opts, limit: 200 });
    const index = results.findIndex((r) => r.bundleId === bundleId);
    return index === -1 ? null : index + 1;
  }

  /** Scrape full listing page for data not in iTunes API */
  async scrapeListing(
    trackViewUrl: string,
    country = 'us',
  ): Promise<{
    subtitle?: string;
    promotionalText?: string;
    whatsNew?: string;
    ratings?: { total: number; average: number };
  }> {
    return this.cached(`appstore:listing:${trackViewUrl}:${country}`, () =>
      this.enqueue(async () => {
        const { body } = await request(trackViewUrl, {
          headers: { 'User-Agent': randomUserAgent() },
        });
        const html = await body.text();
        const $ = cheerio.load(html);

        return {
          subtitle: $('h2.product-header__subtitle').text().trim() || undefined,
          promotionalText: $('[data-test-id="promotional-text"]').text().trim() || undefined,
          whatsNew: $('[data-test-id="whats-new"] .we-truncate__child').text().trim() || undefined,
          ratings: {
            total: parseInt($('.we-customer-ratings__count').text().replace(/[^0-9]/g, ''), 10) || 0,
            average: parseFloat($('.we-customer-ratings__averages__display').text()) || 0,
          },
        };
      }),
    );
  }
}

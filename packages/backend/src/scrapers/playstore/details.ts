import { request } from 'undici';
import { BaseScraper, randomUserAgent } from '../base.js';
import { extractDataBlocks, parseAppDetails } from './parser.js';
import { gplayApp, gplaySimilar } from './gplay.js';
import type { ParsedAppDetails } from './parser.js';

export type { ParsedAppDetails as PlayStoreAppDetails };

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details';

export class PlayStoreDetailsScraper extends BaseScraper {
  constructor() {
    super({ concurrency: 3, intervalMs: 500, cacheTtlSeconds: 3600 });
  }

  /** Get full app details by package name */
  async getAppDetails(
    packageName: string,
    lang = 'en',
    country = 'us',
  ): Promise<ParsedAppDetails | null> {
    return this.cached(`playstore:details:${packageName}:${lang}:${country}`, () =>
      this.enqueue(async () => {
        // Primary: google-play-scraper (community-maintained, handles structure changes)
        try {
          const r = await gplayApp(packageName, { lang, country });
          return {
            appId: r.appId,
            title: r.title,
            shortDescription: r.summary,
            description: r.description,
            descriptionHtml: r.descriptionHTML,
            developer: r.developer,
            developerEmail: r.developerEmail,
            developerWebsite: r.developerWebsite,
            developerAddress: r.developerAddress,
            icon: r.icon,
            headerImage: r.headerImage,
            screenshots: r.screenshots,
            video: r.video,
            category: r.genre,
            categoryId: r.genreId,
            score: r.score,
            ratings: r.ratings,
            histogram: r.histogram,
            installs: r.installs,
            free: r.free,
            price: r.price,
            currency: r.currency,
            contentRating: r.contentRating,
            released: r.released,
            updated: r.updated,
            updatedText: r.updated ? new Date(r.updated).toLocaleDateString() : undefined,
            version: r.version,
            recentChanges: r.recentChanges,
            url: r.url,
          } satisfies ParsedAppDetails;
        } catch (err) {
          console.warn(`[details] gplay failed for "${packageName}", falling back to HTML:`, (err as Error).message);
        }

        // Fallback: our own AF_initDataCallback data block parsing
        return this.getAppDetailsFromHtml(packageName, lang, country);
      }),
    );
  }

  /** Fallback: parse details from HTML data blocks */
  private async getAppDetailsFromHtml(
    packageName: string,
    lang: string,
    country: string,
  ): Promise<ParsedAppDetails | null> {
    const html = await this.fetchDetailPage(packageName, lang, country);
    const blocks = extractDataBlocks(html);
    return parseAppDetails(blocks);
  }

  /** Fetch the raw HTML of a Play Store detail page */
  private async fetchDetailPage(
    packageName: string,
    lang: string,
    country: string,
  ): Promise<string> {
    const url = `${PLAY_STORE_URL}?id=${encodeURIComponent(packageName)}&hl=${lang}&gl=${country}`;
    const { body, statusCode } = await request(url, {
      headers: { 'User-Agent': randomUserAgent() },
    });
    const html = await body.text();
    if (statusCode !== 200) {
      throw new Error(`Play Store returned ${statusCode} for ${packageName}`);
    }
    return html;
  }

  /** Get details for multiple apps */
  async getBulkDetails(
    packageNames: string[],
    lang = 'en',
    country = 'us',
  ): Promise<ParsedAppDetails[]> {
    const results = await Promise.allSettled(
      packageNames.map((pkg) => this.getAppDetails(pkg, lang, country)),
    );

    return results
      .filter(
        (r): r is PromiseFulfilledResult<ParsedAppDetails | null> =>
          r.status === 'fulfilled' && r.value !== null,
      )
      .map((r) => r.value!);
  }

  /** Get similar apps using google-play-scraper */
  async getSimilarApps(
    packageName: string,
    lang = 'en',
    country = 'us',
  ): Promise<ParsedAppDetails[]> {
    return this.cached(`playstore:similar:${packageName}:${lang}:${country}`, () =>
      this.enqueue(async () => {
        try {
          const similar = await gplaySimilar(packageName, { lang, country });
          // Fetch full details for each similar app (top 10)
          const topSimilar = similar.slice(0, 10);
          const details = await Promise.allSettled(
            topSimilar.map((app) => this.getAppDetails(app.appId, lang, country)),
          );

          return details
            .filter(
              (d): d is PromiseFulfilledResult<ParsedAppDetails | null> =>
                d.status === 'fulfilled' && d.value !== null,
            )
            .map((d) => d.value!);
        } catch (err) {
          console.warn(`[similar] gplay.similar failed for "${packageName}":`, (err as Error).message);
          return [];
        }
      }),
    );
  }
}

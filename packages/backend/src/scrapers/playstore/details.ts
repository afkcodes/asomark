import { request } from 'undici';
import { BaseScraper, randomUserAgent } from '../base.js';
import { extractDataBlocks, parseAppDetails } from './parser.js';
import type { ParsedAppDetails } from './parser.js';

export type { ParsedAppDetails as PlayStoreAppDetails };

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details';

export class PlayStoreDetailsScraper extends BaseScraper {
  constructor() {
    super({ concurrency: 3, intervalMs: 500, cacheTtlSeconds: 3600 });
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

  /** Get full app details by package name */
  async getAppDetails(
    packageName: string,
    lang = 'en',
    country = 'us',
  ): Promise<ParsedAppDetails | null> {
    return this.cached(`playstore:details:${packageName}:${lang}:${country}`, () =>
      this.enqueue(async () => {
        const html = await this.fetchDetailPage(packageName, lang, country);
        const blocks = extractDataBlocks(html);
        return parseAppDetails(blocks);
      }),
    );
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

  /** Get similar apps by scraping the detail page's related apps */
  async getSimilarApps(
    packageName: string,
    lang = 'en',
    country = 'us',
  ): Promise<ParsedAppDetails[]> {
    // Similar apps require visiting the similar page
    return this.cached(`playstore:similar:${packageName}:${lang}:${country}`, () =>
      this.enqueue(async () => {
        const url = `https://play.google.com/store/apps/collection/cluster?clp=ogooCAESHQoXY29tLmdvb2dsZS5hbmRyb2lkLmFwcHMQARgD&gsr=CiuiCigIARIdChdjb20uZ29vZ2xlLmFuZHJvaWQuYXBwcxABGAM%3D%3AS%3AANO1ljIjBaI&hl=${lang}&gl=${country}`;
        // Fallback: just fetch the detail page and look for similar apps data
        const html = await this.fetchDetailPage(packageName, lang, country);
        const blocks = extractDataBlocks(html);

        // ds:8 contains similar/recommended apps
        const ds8 = blocks.get('ds:8') as unknown[];
        if (!ds8) return [];

        const results: ParsedAppDetails[] = [];
        // Recursively find package names in ds:8
        const pkgMatches = JSON.stringify(ds8).match(/com\.[a-z][a-z0-9_.]+/g);
        if (pkgMatches) {
          const uniquePkgs = [...new Set(pkgMatches)]
            .filter((p) => p !== packageName)
            .slice(0, 10);

          // Fetch details for each similar app
          const details = await Promise.allSettled(
            uniquePkgs.map((pkg) => this.getAppDetails(pkg, lang, country)),
          );

          for (const d of details) {
            if (d.status === 'fulfilled' && d.value) {
              results.push(d.value);
            }
          }
        }

        return results;
      }),
    );
  }
}

import { request } from 'undici';
import * as cheerio from 'cheerio';
import { BaseScraper, randomUserAgent } from '../base.js';
import { extractDataBlocks, parseSearchResults } from './parser.js';
import type { ParsedSearchResult } from './parser.js';

export type { ParsedSearchResult as PlayStoreSearchResult };

const PLAY_STORE_SEARCH_URL = 'https://play.google.com/store/search';
const GOOGLE_SUGGEST_URL = 'https://suggestqueries.google.com/complete/search';

export class PlayStoreSearchScraper extends BaseScraper {
  constructor() {
    super({ concurrency: 3, intervalMs: 500, cacheTtlSeconds: 1800 });
  }

  /** Search Play Store for a keyword and return ranked results */
  async search(
    term: string,
    opts: { lang?: string; country?: string } = {},
  ): Promise<ParsedSearchResult[]> {
    const { lang = 'en', country = 'us' } = opts;

    return this.cached(`playstore:search:${term}:${lang}:${country}`, () =>
      this.enqueue(async () => {
        const url = `${PLAY_STORE_SEARCH_URL}?q=${encodeURIComponent(term)}&c=apps&hl=${lang}&gl=${country}`;
        const { body, statusCode } = await request(url, {
          headers: { 'User-Agent': randomUserAgent() },
        });
        const html = await body.text();
        if (statusCode !== 200) {
          throw new Error(`Play Store search returned ${statusCode}`);
        }

        // Try JSON data blocks first (richer data)
        const blocks = extractDataBlocks(html);
        const jsonResults = parseSearchResults(blocks);

        // Also extract from HTML links (catches all results including additional clusters)
        const htmlResults = this.parseSearchResultsFromHtml(html);

        // Merge: JSON results take priority (richer data), add any HTML-only results
        const seen = new Set(jsonResults.map((r) => r.appId));
        for (const r of htmlResults) {
          if (!seen.has(r.appId)) {
            jsonResults.push(r);
            seen.add(r.appId);
          }
        }

        return jsonResults;
      }),
    );
  }

  /** Parse search results from HTML links (like aso-agent's Cheerio approach) */
  private parseSearchResultsFromHtml(html: string): ParsedSearchResult[] {
    const $ = cheerio.load(html);
    const results: ParsedSearchResult[] = [];
    const seen = new Set<string>();

    $('a[href^="/store/apps/details"]').each((_i, el) => {
      const link = $(el);
      const href = link.attr('href') ?? '';
      const appId = new URLSearchParams(href.split('?')[1]).get('id');
      if (!appId || seen.has(appId)) return;
      seen.add(appId);

      const title = link.find('.DdYX5').text().trim()
        || link.find('[class*="title"]').text().trim()
        || '';
      const developer = link.find('.wMUdtb').text().trim();
      const ratingText = link.find('.w2kbF').text().trim();
      const score = ratingText ? parseFloat(ratingText) : 0;

      let icon = '';
      link.find('img').each((_j, img) => {
        const src = $(img).attr('src') ?? '';
        if (src.includes('s64-rw') || src.includes('=s64')) icon = src;
      });
      if (!icon) {
        const imgs = link.find('img');
        if (imgs.length > 0) icon = $(imgs[imgs.length - 1]).attr('src') ?? '';
      }

      results.push({
        appId,
        title,
        developer,
        icon,
        score,
        scoreText: ratingText,
        installs: '',
        category: '',
        free: true,
        url: `https://play.google.com/store/apps/details?id=${appId}`,
      });
    });

    return results;
  }

  /** Get rank of a specific app for a keyword */
  async getRank(
    term: string,
    packageName: string,
    opts: { lang?: string; country?: string } = {},
  ): Promise<number | null> {
    const results = await this.search(term, opts);
    const index = results.findIndex((r) => r.appId === packageName);
    return index === -1 ? null : index + 1;
  }

  /** Get ranks for multiple keywords at once */
  async getRanks(
    terms: string[],
    packageName: string,
    opts: { lang?: string; country?: string } = {},
  ): Promise<Map<string, number | null>> {
    const rankMap = new Map<string, number | null>();

    const results = await Promise.allSettled(
      terms.map(async (term) => {
        const rank = await this.getRank(term, packageName, opts);
        return { term, rank };
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        rankMap.set(result.value.term, result.value.rank);
      }
    }

    return rankMap;
  }

  /** Get autocomplete suggestions using Google suggest with Play Store datasource */
  async suggest(
    term: string,
    opts: { lang?: string; country?: string } = {},
  ): Promise<string[]> {
    const { lang = 'en', country = 'us' } = opts;

    return this.cached(`playstore:suggest:${term}:${lang}:${country}`, () =>
      this.enqueue(async () => {
        // Use Google suggest with client=firefox for JSON response
        // ds=ah targets Android/Play Store suggestions
        const url = `${GOOGLE_SUGGEST_URL}?client=firefox&q=${encodeURIComponent(term)}&hl=${lang}&gl=${country}`;
        const { body } = await request(url, {
          headers: { 'User-Agent': randomUserAgent() },
        });
        const data = (await body.json()) as [string, string[]];
        return data[1] ?? [];
      }),
    );
  }

  /** Alphabet soup: mine keyword suggestions for every letter prefix */
  async alphabetSoup(
    prefix: string,
    opts: { lang?: string; country?: string } = {},
  ): Promise<string[]> {
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const allSuggestions = new Set<string>();

    // Base suggestions first
    const base = await this.suggest(prefix, opts);
    for (const s of base) allSuggestions.add(s);

    const results = await Promise.allSettled(
      letters.map((letter) => this.suggest(`${prefix} ${letter}`, opts)),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const s of result.value) allSuggestions.add(s);
      }
    }

    return Array.from(allSuggestions);
  }
}

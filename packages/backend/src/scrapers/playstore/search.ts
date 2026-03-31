import * as cheerio from 'cheerio';
import { BaseScraper } from '../base.js';
import { gplaySearch, gplaySuggest } from './gplay.js';
import type { GplaySearchResult } from './gplay.js';

export interface ParsedSearchResult {
  appId: string;
  title: string;
  developer: string;
  icon: string;
  score: number;
  scoreText: string;
  installs: string;
  category: string;
  free: boolean;
  url: string;
}

export type { ParsedSearchResult as PlayStoreSearchResult };

export class PlayStoreSearchScraper extends BaseScraper {
  constructor() {
    super({ concurrency: 3, intervalMs: 500, cacheTtlSeconds: 1800 });
  }

  /** Search Play Store for a keyword and return ranked results */
  async search(
    term: string,
    opts: { lang?: string; country?: string; num?: number } = {},
  ): Promise<ParsedSearchResult[]> {
    const { lang = 'en', country = 'us', num = 50 } = opts;

    return this.cached(`playstore:search:${term}:${lang}:${country}`, () =>
      this.enqueue(async () => {
        // Primary: google-play-scraper (uses internal APIs, community-maintained)
        try {
          const results = await gplaySearch(term, { num, lang, country });
          if (results.length > 0) {
            return results.map((r) => this.fromGplay(r));
          }
        } catch (err) {
          console.warn(`[search] gplay failed for "${term}", falling back to HTML:`, (err as Error).message);
        }

        // Fallback: direct HTML scraping (less reliable but independent)
        return this.searchFromHtml(term, { lang, country });
      }),
    );
  }

  /** Fallback: parse search results from HTML using CSS selectors */
  private async searchFromHtml(
    term: string,
    opts: { lang: string; country: string },
  ): Promise<ParsedSearchResult[]> {
    const { default: undici } = await import('undici');
    const { randomUserAgent } = await import('../base.js');

    const url = `https://play.google.com/store/search?q=${encodeURIComponent(term)}&c=apps&hl=${opts.lang}&gl=${opts.country}`;
    const { body, statusCode } = await undici.request(url, {
      headers: { 'User-Agent': randomUserAgent() },
    });
    const html = await body.text();
    if (statusCode !== 200) {
      throw new Error(`Play Store search returned ${statusCode}`);
    }

    return this.parseSearchResultsFromHtml(html);
  }

  /** Parse search results from HTML links (Cheerio CSS selectors) */
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

  /** Convert gplay search result to our interface */
  private fromGplay(r: GplaySearchResult): ParsedSearchResult {
    return {
      appId: r.appId,
      title: r.title,
      developer: r.developer,
      icon: r.icon,
      score: r.score,
      scoreText: r.score ? String(r.score.toFixed(1)) : '',
      installs: r.installs ?? '',
      category: '',
      free: r.free,
      url: r.url,
    };
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

  /** Get autocomplete suggestions using google-play-scraper */
  async suggest(
    term: string,
    opts: { lang?: string; country?: string } = {},
  ): Promise<string[]> {
    const { lang = 'en', country = 'us' } = opts;

    return this.cached(`playstore:suggest:${term}:${lang}:${country}`, () =>
      this.enqueue(async () => {
        // Primary: google-play-scraper suggest (fast, no browser needed)
        try {
          const suggestions = await gplaySuggest(term);
          if (suggestions.length > 0) return suggestions;
        } catch {
          // fall through
        }

        // Fallback: Google suggest API with firefox client
        const { default: undici } = await import('undici');
        const { randomUserAgent } = await import('../base.js');
        const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(term)}&hl=${lang}&gl=${country}`;
        const { body } = await undici.request(url, {
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

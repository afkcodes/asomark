import { request } from 'undici';
import { BaseScraper, randomUserAgent } from './base.js';

export class YouTubeSuggestScraper extends BaseScraper {
  constructor() {
    super({ concurrency: 1, intervalMs: 500, cacheTtlSeconds: 86400 });
  }

  /** Get YouTube autocomplete suggestions */
  async suggest(
    query: string,
    opts: { lang?: string; country?: string } = {},
  ): Promise<string[]> {
    const { lang = 'en', country = 'us' } = opts;

    return this.cached(`youtube:suggest:${query}:${lang}:${country}`, () =>
      this.enqueue(async () => {
        const url = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query)}&hl=${lang}&gl=${country}`;
        const { body } = await request(url, {
          headers: { 'User-Agent': randomUserAgent() },
        });
        const text = await body.text();
        // Response is JSONP: window.google.ac.h([...])
        // Strip everything before first '[' and the trailing ')'
        const jsonStr = text.replace(/^[^[]+/, '').replace(/\)$/, '');
        const data = JSON.parse(jsonStr) as Array<[string, number, number[]]>;
        return data.map((item) => item[0]);
      }),
    );
  }

  /** Alphabet soup for YouTube suggestions */
  async alphabetSoup(
    seed: string,
    opts: { lang?: string; country?: string } = {},
  ): Promise<string[]> {
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const allSuggestions = new Set<string>();

    const baseSuggestions = await this.suggest(seed, opts);
    for (const s of baseSuggestions) allSuggestions.add(s);

    const results = await Promise.allSettled(
      letters.map((letter) => this.suggest(`${seed} ${letter}`, opts)),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const s of result.value) allSuggestions.add(s);
      }
    }

    return Array.from(allSuggestions);
  }
}

import { request } from 'undici';
import { BaseScraper, randomUserAgent } from './base.js';

export class GoogleSuggestScraper extends BaseScraper {
  constructor() {
    super({ concurrency: 1, intervalMs: 500, cacheTtlSeconds: 86400 });
  }

  /** Get Google autocomplete suggestions for a query */
  async suggest(
    query: string,
    opts: { lang?: string; country?: string } = {},
  ): Promise<string[]> {
    const { lang = 'en', country = 'us' } = opts;

    return this.cached(`google:suggest:${query}:${lang}:${country}`, () =>
      this.enqueue(async () => {
        const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}&hl=${lang}&gl=${country}`;
        const { body } = await request(url, {
          headers: { 'User-Agent': randomUserAgent() },
        });
        const data = (await body.json()) as [string, string[]];
        return data[1] ?? [];
      }),
    );
  }

  /** Alphabet soup: generate suggestions for every letter prefix */
  async alphabetSoup(
    seed: string,
    opts: { lang?: string; country?: string } = {},
  ): Promise<string[]> {
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const allSuggestions = new Set<string>();

    // Also get base suggestions
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

  /** Deep alphabet soup: two-letter combinations for broader coverage */
  async deepAlphabetSoup(
    seed: string,
    opts: { lang?: string; country?: string } = {},
  ): Promise<string[]> {
    // First level
    const firstLevel = await this.alphabetSoup(seed, opts);

    // Second level: for each suggestion, get more suggestions
    const allSuggestions = new Set(firstLevel);

    const topSuggestions = firstLevel.slice(0, 10);
    const results = await Promise.allSettled(
      topSuggestions.map((s) => this.suggest(s, opts)),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const s of result.value) allSuggestions.add(s);
      }
    }

    return Array.from(allSuggestions);
  }

  /** Get suggestions with app-specific modifiers */
  async appKeywordMining(
    seed: string,
    opts: { lang?: string; country?: string } = {},
  ): Promise<string[]> {
    const modifiers = [
      'app',
      'best',
      'free',
      'top',
      'how to',
      'alternative',
      'vs',
      'like',
      'for android',
      'for iphone',
    ];

    const allSuggestions = new Set<string>();

    // Base suggestions
    const base = await this.alphabetSoup(seed, opts);
    for (const s of base) allSuggestions.add(s);

    // Modified suggestions
    const results = await Promise.allSettled(
      modifiers.map((mod) => this.suggest(`${mod} ${seed}`, opts)),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const s of result.value) allSuggestions.add(s);
      }
    }

    return Array.from(allSuggestions);
  }
}

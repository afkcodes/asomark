/**
 * Play Store autocomplete suggestion scraper.
 *
 * Primary: google-play-scraper suggest API (fast, no browser needed).
 * Fallback: Playwright browser automation for the actual Play Store search bar.
 *
 * The Playwright path is kept for alphabet soup operations where we
 * need to reuse a single browser page for 27 queries efficiently.
 */
import { chromium, type Browser } from 'playwright';
import { BaseScraper } from '../base.js';
import { gplaySuggest } from './gplay.js';

export class PlayStoreSuggestScraper extends BaseScraper {
  private browser: Browser | null = null;

  constructor() {
    super({ concurrency: 1, intervalMs: 1000, cacheTtlSeconds: 1800 });
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    }
    return this.browser;
  }

  /** Get Play Store autocomplete suggestions */
  async suggest(
    term: string,
    opts: { lang?: string; country?: string } = {},
  ): Promise<string[]> {
    const { lang = 'en', country = 'us' } = opts;

    return this.cached(`playstore:suggest:${term}:${lang}:${country}`, () =>
      this.enqueue(async () => {
        // Primary: Playwright browser — types into actual Play Store search bar
        // to get real autocomplete suggestions (matches aso-agent's Puppeteer approach).
        // This returns more results (5-8) than the API endpoint (max 5).
        try {
          const suggestions = await this.suggestViaBrowser(term, lang, country);
          if (suggestions.length > 0) return suggestions;
        } catch {
          // fall through to API
        }

        // Fallback: google-play-scraper suggest API (fast, but only 5 results)
        try {
          const suggestions = await gplaySuggest(term);
          if (suggestions.length > 0) return suggestions;
        } catch {
          // no suggestions available
        }

        return [];
      }),
    );
  }

  /** Browser-based suggest (fallback) */
  private async suggestViaBrowser(
    term: string,
    lang: string,
    country: string,
  ): Promise<string[]> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    try {
      await page.goto(
        `https://play.google.com/store/search?q=${encodeURIComponent(term)}&c=apps&hl=${lang}&gl=${country}`,
        { waitUntil: 'networkidle', timeout: 15000 },
      );

      const searchInput = page.locator('input[aria-label="Search Google Play"]');
      await searchInput.click();
      await page.keyboard.press('Control+a');
      await page.keyboard.type(term, { delay: 50 });
      await page.waitForTimeout(1500);

      return await this.extractSuggestions(page);
    } finally {
      await context.close();
    }
  }

  /** Extract suggestions from the autocomplete dropdown DOM */
  private async extractSuggestions(page: { evaluate: (script: string) => Promise<unknown> }): Promise<string[]> {
    return await page.evaluate(`
      (() => {
        const items = document.querySelectorAll(
          '[role="option"], [role="listbox"] li, .qhE8Fb'
        );
        const results = [];

        items.forEach((item) => {
          const spans = item.querySelectorAll('span');
          let text = '';

          spans.forEach((span) => {
            const spanText = (span.textContent || '').trim();
            if (
              spanText &&
              spanText.length > 2 &&
              !spanText.includes('search') &&
              !spanText.includes('north') &&
              !spanText.includes('west') &&
              !/^[a-z_]+$/.test(spanText)
            ) {
              text = spanText;
            }
          });

          if (!text) {
            const rawText = (item.textContent || '').trim();
            text = rawText
              .replace(/search/gi, '')
              .replace(/north_west/gi, '')
              .replace(/arrow_back/gi, '')
              .trim();
          }

          if (text && text.length > 3 && !results.includes(text)) {
            results.push(text);
          }
        });

        return results;
      })()
    `) as string[];
  }

  /**
   * Get the position (1-based) of a keyword in Play Store autocomplete.
   * Returns null if not found.
   */
  async getPosition(
    term: string,
    keyword: string,
    opts: { lang?: string; country?: string } = {},
  ): Promise<number | null> {
    const suggestions = await this.suggest(term, opts);
    const lowerKeyword = keyword.toLowerCase();
    const idx = suggestions.findIndex((s) => s.toLowerCase() === lowerKeyword);
    return idx === -1 ? null : idx + 1;
  }

  /** Alphabet soup: mine suggestions for prefix + each letter a-z.
   * Uses a single browser page for efficiency — browser reuse is important here.
   */
  async alphabetSoup(
    prefix: string,
    opts: { lang?: string; country?: string } = {},
  ): Promise<string[]> {
    const { lang = 'en', country = 'us' } = opts;
    const allSuggestions = new Set<string>();

    // First try to get base suggestions via the fast path
    try {
      const baseSuggestions = await gplaySuggest(prefix);
      for (const s of baseSuggestions) allSuggestions.add(s);
    } catch {
      // continue with browser
    }

    // For alphabet soup, use browser — single page reused for all 26 letters
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    try {
      await page.goto(
        `https://play.google.com/store/search?q=${encodeURIComponent(prefix)}&c=apps&hl=${lang}&gl=${country}`,
        { waitUntil: 'networkidle', timeout: 15000 },
      );

      const searchInput = page.locator('input[aria-label="Search Google Play"]');

      const queries = [prefix, ...'abcdefghijklmnopqrstuvwxyz'.split('').map((l) => `${prefix} ${l}`)];

      for (const query of queries) {
        try {
          await searchInput.click();
          await page.keyboard.press('Control+a');
          await page.keyboard.type(query, { delay: 30 });
          await page.waitForTimeout(1000);

          const suggestions = await this.extractSuggestions(page);
          for (const s of suggestions) {
            allSuggestions.add(s);
          }
        } catch {
          // Continue on individual letter failure
        }
      }
    } finally {
      await context.close();
    }

    return Array.from(allSuggestions);
  }

  /** Cleanup browser on shutdown */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

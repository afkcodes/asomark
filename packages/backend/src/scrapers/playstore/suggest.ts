/**
 * Play Store autocomplete suggestion scraper.
 * Uses Playwright to interact with the actual Play Store search bar
 * and capture real autocomplete suggestions — the same approach
 * aso-agent uses with Puppeteer.
 *
 * This gives us the actual keywords people type in the Play Store,
 * which are far more relevant for ASO than Google web suggestions.
 */
import { chromium, type Browser } from 'playwright';
import { BaseScraper } from '../base.js';

export class PlayStoreSuggestScraper extends BaseScraper {
  private browser: Browser | null = null;

  constructor() {
    // Lower concurrency — browser is heavy
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

  /** Get Play Store autocomplete suggestions by typing into the search bar */
  async suggest(
    term: string,
    opts: { lang?: string; country?: string } = {},
  ): Promise<string[]> {
    const { lang = 'en', country = 'us' } = opts;

    return this.cached(`playstore:suggest:${term}:${lang}:${country}`, () =>
      this.enqueue(async () => {
        const browser = await this.getBrowser();
        const context = await browser.newContext({
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });
        const page = await context.newPage();

        try {
          // Navigate to Play Store search page
          await page.goto(
            `https://play.google.com/store/search?q=${encodeURIComponent(term)}&c=apps&hl=${lang}&gl=${country}`,
            { waitUntil: 'networkidle', timeout: 15000 },
          );

          // Find and interact with search input
          const searchInput = page.locator('input[aria-label="Search Google Play"]');
          await searchInput.click();

          // Select all existing text and replace with our term
          await page.keyboard.press('Control+a');
          await page.keyboard.type(term, { delay: 50 });

          // Wait for autocomplete dropdown to appear
          await page.waitForTimeout(1500);

          // Extract suggestion text from autocomplete dropdown
          const suggestions = await page.evaluate(`
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

          return suggestions;
        } finally {
          await context.close();
        }
      }),
    );
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
   * Uses a single browser page and retypes for each letter — much faster
   * than creating a new context per query.
   */
  async alphabetSoup(
    prefix: string,
    opts: { lang?: string; country?: string } = {},
  ): Promise<string[]> {
    const { lang = 'en', country = 'us' } = opts;
    const allSuggestions = new Set<string>();

    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    try {
      // Navigate once
      await page.goto(
        `https://play.google.com/store/search?q=${encodeURIComponent(prefix)}&c=apps&hl=${lang}&gl=${country}`,
        { waitUntil: 'networkidle', timeout: 15000 },
      );

      const searchInput = page.locator('input[aria-label="Search Google Play"]');

      // Mine base prefix + each letter
      const queries = [prefix, ...'abcdefghijklmnopqrstuvwxyz'.split('').map((l) => `${prefix} ${l}`)];

      for (const query of queries) {
        try {
          await searchInput.click();
          await page.keyboard.press('Control+a');
          await page.keyboard.type(query, { delay: 30 });
          await page.waitForTimeout(1000);

          const suggestions = await page.evaluate(`
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

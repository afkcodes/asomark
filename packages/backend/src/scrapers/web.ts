import { request } from 'undici';
import * as cheerio from 'cheerio';
import { BaseScraper, randomUserAgent } from './base.js';

export interface WebPageData {
  url: string;
  title: string;
  description: string;
  text: string;
  links: string[];
}

export class WebScraper extends BaseScraper {
  constructor() {
    super({ concurrency: 1, intervalMs: 2000, cacheTtlSeconds: 3600 });
  }

  /** Fetch and parse a web page */
  async fetchPage(url: string): Promise<WebPageData> {
    return this.cached(`web:page:${url}`, () =>
      this.enqueue(async () => {
        const { body } = await request(url, {
          headers: { 'User-Agent': randomUserAgent() },
        });
        const html = await body.text();
        const $ = cheerio.load(html);

        // Remove script and style elements
        $('script, style, noscript').remove();

        return {
          url,
          title: $('title').text().trim(),
          description:
            $('meta[name="description"]').attr('content')?.trim() ?? '',
          text: $('body').text().replace(/\s+/g, ' ').trim(),
          links: $('a[href]')
            .map((_, el) => $(el).attr('href'))
            .get()
            .filter((href): href is string => typeof href === 'string' && href.startsWith('http')),
        };
      }),
    );
  }

  /** Fetch JSON from a URL */
  async fetchJson<T = unknown>(url: string): Promise<T> {
    return this.cached(`web:json:${url}`, () =>
      this.enqueue(async () => {
        const { body } = await request(url, {
          headers: {
            'User-Agent': randomUserAgent(),
            Accept: 'application/json',
          },
        });
        return (await body.json()) as T;
      }),
    );
  }
}

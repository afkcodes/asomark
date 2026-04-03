/**
 * BFS site crawler for technical SEO auditing.
 * Uses Playwright to render JavaScript-heavy pages (SPAs, React/Next.js)
 * before checking for SEO issues — matches what Googlebot sees.
 */
import { chromium, type Browser } from 'playwright';
import * as cheerio from 'cheerio';

// ─── Types ───

export interface PageAuditResult {
  url: string;
  statusCode: number;
  loadTimeMs: number;
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  h1Count: number;
  h1Text: string | null;
  imageCount: number;
  imagesWithoutAlt: number;
  internalLinks: number;
  externalLinks: number;
  brokenLinks: string[];
  wordCount: number;
  hasCanonical: boolean;
  canonicalUrl: string | null;
  hasRobotsMeta: boolean;
  schemaTypes: string[];
  issues: Array<{ type: 'critical' | 'warning' | 'info'; code: string; message: string }>;
  score: number;
  /** Internal link URLs found on this page (for BFS) */
  discoveredUrls: string[];
}

export interface CrawlProgress {
  crawled: number;
  total: number;
  currentUrl: string;
}

// ─── Crawler ───

export class SiteCrawler {
  private maxPages: number;
  private delayMs: number;
  private browser: Browser | null = null;

  constructor(opts: { maxPages?: number; delayMs?: number } = {}) {
    this.maxPages = opts.maxPages ?? 50;
    this.delayMs = opts.delayMs ?? 500;
  }

  /**
   * Crawl a website starting from the given URL.
   * Uses Playwright to render pages (handles SPAs/React/Next.js).
   * BFS to follow internal links up to maxPages.
   */
  async crawl(
    startUrl: string,
    onProgress?: (progress: CrawlProgress) => void,
  ): Promise<PageAuditResult[]> {
    const baseUrl = new URL(startUrl);
    const baseOrigin = baseUrl.origin;

    // Launch browser once, reuse for all pages
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const visited = new Set<string>();
    const queue: string[] = [this.normalizeUrl(startUrl)];
    const results: PageAuditResult[] = [];

    try {
      while (queue.length > 0 && visited.size < this.maxPages) {
        const url = queue.shift()!;
        if (visited.has(url)) continue;
        visited.add(url);

        onProgress?.({
          crawled: visited.size,
          total: visited.size + queue.length,
          currentUrl: url,
        });

        try {
          const result = await this.auditPage(url, baseOrigin);
          results.push(result);

          // Add discovered internal links to queue
          for (const link of result.discoveredUrls) {
            const normalized = this.normalizeUrl(link);
            if (!visited.has(normalized) && !queue.includes(normalized)) {
              queue.push(normalized);
            }
          }
        } catch (err) {
          results.push({
            url,
            statusCode: 0,
            loadTimeMs: 0,
            title: null,
            titleLength: 0,
            metaDescription: null,
            metaDescriptionLength: 0,
            h1Count: 0,
            h1Text: null,
            imageCount: 0,
            imagesWithoutAlt: 0,
            internalLinks: 0,
            externalLinks: 0,
            brokenLinks: [],
            wordCount: 0,
            hasCanonical: false,
            canonicalUrl: null,
            hasRobotsMeta: false,
            schemaTypes: [],
            issues: [{ type: 'critical', code: 'FETCH_ERROR', message: `Failed to load: ${(err as Error).message}` }],
            score: 0,
            discoveredUrls: [],
          });
        }

        // Rate limit between pages
        if (queue.length > 0) {
          await new Promise((r) => setTimeout(r, this.delayMs));
        }
      }
    } finally {
      await this.browser.close();
      this.browser = null;
    }

    return results;
  }

  /** Audit a single page for SEO issues — uses Playwright to render JS */
  private async auditPage(url: string, baseOrigin: string): Promise<PageAuditResult> {
    if (!this.browser) throw new Error('Browser not initialized');

    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    let statusCode = 200;
    const start = Date.now();

    // Capture the response status code
    page.on('response', (response) => {
      if (response.url() === url || response.url() === url + '/') {
        statusCode = response.status();
      }
    });

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    } catch {
      // Timeout or navigation error — still try to extract what we can
    }

    // Wait a bit more for any lazy-loaded content
    await page.waitForTimeout(1000);

    const html = await page.content();
    const loadTimeMs = Date.now() - start;
    await context.close();

    const $ = cheerio.load(html);
    const issues: PageAuditResult['issues'] = [];

    // ─── Title ───
    const title = $('title').text().trim() || null;
    const titleLength = title?.length ?? 0;

    if (!title) {
      issues.push({ type: 'critical', code: 'MISSING_TITLE', message: 'Page has no <title> tag' });
    } else if (titleLength < 30) {
      issues.push({ type: 'warning', code: 'SHORT_TITLE', message: `Title is too short (${titleLength} chars, recommend 50-60)` });
    } else if (titleLength > 60) {
      issues.push({ type: 'warning', code: 'LONG_TITLE', message: `Title is too long (${titleLength} chars, recommend 50-60)` });
    }

    // ─── Meta Description ───
    const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null;
    const metaDescriptionLength = metaDescription?.length ?? 0;

    if (!metaDescription) {
      issues.push({ type: 'critical', code: 'MISSING_META_DESC', message: 'Page has no meta description' });
    } else if (metaDescriptionLength < 70) {
      issues.push({ type: 'warning', code: 'SHORT_META_DESC', message: `Meta description is too short (${metaDescriptionLength} chars, recommend 120-160)` });
    } else if (metaDescriptionLength > 160) {
      issues.push({ type: 'warning', code: 'LONG_META_DESC', message: `Meta description is too long (${metaDescriptionLength} chars, recommend 120-160)` });
    }

    // ─── H1 ───
    const h1Elements = $('h1');
    const h1Count = h1Elements.length;
    const h1Text = h1Elements.first().text().trim() || null;

    if (h1Count === 0) {
      issues.push({ type: 'critical', code: 'MISSING_H1', message: 'Page has no <h1> heading' });
    } else if (h1Count > 1) {
      issues.push({ type: 'warning', code: 'MULTIPLE_H1', message: `Page has ${h1Count} <h1> tags (should have exactly 1)` });
    }

    // ─── Images ───
    const images = $('img');
    const imageCount = images.length;
    let imagesWithoutAlt = 0;
    images.each((_, el) => {
      const alt = $(el).attr('alt');
      if (!alt || alt.trim() === '') imagesWithoutAlt++;
    });

    if (imagesWithoutAlt > 0) {
      issues.push({
        type: imagesWithoutAlt > 3 ? 'warning' : 'info',
        code: 'IMAGES_NO_ALT',
        message: `${imagesWithoutAlt} of ${imageCount} images missing alt text`,
      });
    }

    // ─── Links ───
    const allLinks = $('a[href]');
    let internalLinks = 0;
    let externalLinks = 0;
    const discoveredUrls: string[] = [];

    allLinks.each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;

      try {
        const resolved = new URL(href, url);
        if (resolved.origin === baseOrigin) {
          internalLinks++;
          // Only follow HTML pages (skip assets, anchors)
          if (!resolved.pathname.match(/\.(jpg|jpeg|png|gif|svg|pdf|css|js|ico|woff|woff2|ttf|eot|mp4|webm|zip)$/i)) {
            discoveredUrls.push(resolved.href.split('#')[0]!.split('?')[0]!);
          }
        } else if (resolved.protocol.startsWith('http')) {
          externalLinks++;
        }
      } catch {
        // Invalid URL, skip
      }
    });

    // ─── Word Count ───
    $('script, style, noscript').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const wordCount = bodyText.split(/\s+/).filter((w) => w.length > 0).length;

    if (wordCount < 300) {
      issues.push({ type: 'info', code: 'THIN_CONTENT', message: `Page has only ${wordCount} words (recommend 300+ for SEO)` });
    }

    // ─── Canonical ───
    const canonicalUrl = $('link[rel="canonical"]').attr('href') || null;
    const hasCanonical = !!canonicalUrl;

    if (!hasCanonical) {
      issues.push({ type: 'info', code: 'NO_CANONICAL', message: 'Page has no canonical URL tag' });
    }

    // ─── Robots Meta ───
    const robotsMeta = $('meta[name="robots"]').attr('content') || '';
    const hasRobotsMeta = !!robotsMeta;

    if (robotsMeta.includes('noindex')) {
      issues.push({ type: 'warning', code: 'NOINDEX', message: 'Page is set to noindex — it won\'t appear in search results' });
    }

    // ─── Schema/Structured Data ───
    const schemaTypes: string[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || '{}');
        if (data['@type']) schemaTypes.push(data['@type']);
        if (Array.isArray(data['@graph'])) {
          for (const item of data['@graph']) {
            if (item['@type']) schemaTypes.push(item['@type']);
          }
        }
      } catch {
        // Invalid JSON-LD
      }
    });

    // Only flag missing schema on the homepage — not on every page
    if (schemaTypes.length === 0) {
      const pathname = new URL(url).pathname;
      if (pathname === '/' || pathname === '') {
        issues.push({ type: 'info', code: 'NO_SCHEMA', message: 'No structured data (JSON-LD) found — add WebSite + SoftwareApplication schema' });
      }
    }

    // ─── Status Code ───
    if (statusCode >= 400) {
      issues.push({ type: 'critical', code: 'HTTP_ERROR', message: `Page returned HTTP ${statusCode}` });
    } else if (statusCode >= 300) {
      issues.push({ type: 'info', code: 'REDIRECT', message: `Page redirects (HTTP ${statusCode})` });
    }

    // ─── Load Time ───
    if (loadTimeMs > 3000) {
      issues.push({ type: 'warning', code: 'SLOW_PAGE', message: `Page took ${(loadTimeMs / 1000).toFixed(1)}s to load (recommend <3s)` });
    }

    // ─── Open Graph ───
    const hasOgTitle = !!$('meta[property="og:title"]').attr('content');
    const hasOgDesc = !!$('meta[property="og:description"]').attr('content');
    const hasOgImage = !!$('meta[property="og:image"]').attr('content');

    if (!hasOgTitle || !hasOgDesc || !hasOgImage) {
      const missing = [!hasOgTitle && 'og:title', !hasOgDesc && 'og:description', !hasOgImage && 'og:image'].filter(Boolean);
      issues.push({ type: 'info', code: 'MISSING_OG', message: `Missing Open Graph tags: ${missing.join(', ')}` });
    }

    // ─── Score Calculation ───
    const criticalCount = issues.filter((i) => i.type === 'critical').length;
    const warningCount = issues.filter((i) => i.type === 'warning').length;
    const infoCount = issues.filter((i) => i.type === 'info').length;

    // Start at 100, deduct for issues
    let score = 100;
    score -= criticalCount * 20;
    score -= warningCount * 8;
    score -= infoCount * 2;
    score = Math.max(0, Math.min(100, score));

    return {
      url,
      statusCode,
      loadTimeMs,
      title,
      titleLength,
      metaDescription,
      metaDescriptionLength,
      h1Count,
      h1Text,
      imageCount,
      imagesWithoutAlt,
      internalLinks,
      externalLinks,
      brokenLinks: [], // TODO: check broken links in a follow-up
      wordCount,
      hasCanonical,
      canonicalUrl,
      hasRobotsMeta,
      schemaTypes,
      issues,
      score,
      discoveredUrls,
    };
  }

  /** Normalize a URL (remove trailing slash, fragment, query) */
  private normalizeUrl(url: string): string {
    try {
      const u = new URL(url);
      return `${u.origin}${u.pathname}`.replace(/\/+$/, '') || u.origin;
    } catch {
      return url;
    }
  }
}

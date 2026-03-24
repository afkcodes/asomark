/**
 * Play Store top charts scraper.
 * Scrapes category rankings (Top Free, Top Paid, Top Grossing, Top New Free).
 * Used to populate the categoryRank field in rank_snapshots.
 */
import { request } from 'undici';
import { BaseScraper, randomUserAgent } from '../base.js';
import { extractDataBlocks } from './parser.js';

const PLAY_STORE_BASE = 'https://play.google.com/store/apps';

export type ChartCollection =
  | 'topselling_free'
  | 'topselling_paid'
  | 'topgrossing'
  | 'topselling_new_free';

export interface ChartEntry {
  position: number;  // 1-based rank
  appId: string;     // package name
  title: string;
  developer: string;
  icon: string;
  score: number;     // rating 0-5
  installs: string;
  free: boolean;
}

export class PlayStoreChartsScraper extends BaseScraper {
  constructor() {
    super({ concurrency: 2, intervalMs: 1000, cacheTtlSeconds: 21600 }); // 6h cache
  }

  /**
   * Get top chart for a category.
   * @param category - Play Store category ID (e.g., "PRODUCTIVITY", "GAME_ACTION")
   * @param collection - Chart type
   */
  async getChart(
    category: string,
    collection: ChartCollection = 'topselling_free',
    opts: { lang?: string; country?: string } = {},
  ): Promise<ChartEntry[]> {
    const { lang = 'en', country = 'us' } = opts;

    return this.cached(`playstore:chart:${category}:${collection}:${lang}:${country}`, () =>
      this.enqueue(async () => {
        const url = `${PLAY_STORE_BASE}/category/${encodeURIComponent(category)}/collection/${collection}?hl=${lang}&gl=${country}`;
        const { body, statusCode } = await request(url, {
          headers: { 'User-Agent': randomUserAgent() },
        });
        const html = await body.text();

        if (statusCode !== 200) {
          throw new Error(`Play Store chart returned ${statusCode} for ${category}/${collection}`);
        }

        return this.parseChartPage(html);
      }),
    );
  }

  /**
   * Find the rank of a specific app in a chart.
   * Returns null if not found.
   */
  async getAppChartRank(
    packageName: string,
    category: string,
    collection: ChartCollection = 'topselling_free',
    opts: { lang?: string; country?: string } = {},
  ): Promise<number | null> {
    const chart = await this.getChart(category, collection, opts);
    const entry = chart.find((e) => e.appId === packageName);
    return entry?.position ?? null;
  }

  /**
   * Parse chart page HTML to extract ranked app list.
   * Play Store chart pages use the same AF_initDataCallback pattern.
   */
  private parseChartPage(html: string): ChartEntry[] {
    const blocks = extractDataBlocks(html);
    const entries: ChartEntry[] = [];

    // Chart data is in ds:3 or ds:4 — try both
    for (const dsKey of ['ds:3', 'ds:4']) {
      const ds = blocks.get(dsKey) as unknown[];
      if (!ds) continue;

      // Navigate to the app list cluster
      const apps = this.findAppList(ds);
      if (!apps || apps.length === 0) continue;

      let position = 1;
      for (const entry of apps) {
        const app = this.extractApp(entry);
        if (app) {
          entries.push({ ...app, position });
          position++;
        }
      }

      if (entries.length > 0) break;
    }

    return entries;
  }

  /** Recursively find the array of app entries in chart data */
  private findAppList(data: unknown): unknown[] | null {
    if (!Array.isArray(data)) return null;

    // Check if this array contains app-like objects (arrays with package name pattern)
    for (const item of data) {
      if (Array.isArray(item)) {
        const strVal = this.safeStr(item, 0, 0);
        if (strVal && /^[a-z][a-z0-9_.]+\.[a-z]/.test(strVal)) {
          return data;
        }
        // Recurse
        const found = this.findAppList(item);
        if (found) return found;
      }
    }

    return null;
  }

  /** Extract a single app entry from chart data */
  private extractApp(entry: unknown): Omit<ChartEntry, 'position'> | null {
    if (!Array.isArray(entry)) return null;
    const app = Array.isArray(entry[0]) ? entry[0] as unknown[] : entry as unknown[];

    const appId = this.safeStr(app, 0, 0);
    if (!appId || !/^[a-z]/.test(appId)) return null;

    return {
      appId,
      title: this.safeStr(app, 3) ?? '',
      developer: this.safeStr(app, 14) ?? '',
      icon: this.safeStr(app, 1, 3, 2) ?? '',
      score: this.safeNum(app, 4, 1) ?? 0,
      installs: this.safeStr(app, 15) ?? '',
      free: this.safeNum(app, 8, 5) === 1,
    };
  }

  private safeStr(obj: unknown, ...path: number[]): string | undefined {
    let current = obj;
    for (const key of path) {
      if (!Array.isArray(current) || current[key] === undefined) return undefined;
      current = current[key];
    }
    return typeof current === 'string' ? current : undefined;
  }

  private safeNum(obj: unknown, ...path: number[]): number | undefined {
    let current = obj;
    for (const key of path) {
      if (!Array.isArray(current) || current[key] === undefined) return undefined;
      current = current[key];
    }
    return typeof current === 'number' ? current : undefined;
  }
}

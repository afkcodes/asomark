import PQueue from 'p-queue';
import pRetry from 'p-retry';
import { redis } from '../lib/redis.js';

const USER_AGENTS = [
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

export function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
}

export interface ScraperOptions {
  /** Requests per interval (default 1) */
  concurrency?: number;
  /** Interval between requests in ms (default 1000) */
  intervalMs?: number;
  /** Max retries per request (default 3) */
  maxRetries?: number;
  /** Cache TTL in seconds (default 3600 = 1h) */
  cacheTtlSeconds?: number;
}

export class BaseScraper {
  protected queue: PQueue;
  protected maxRetries: number;
  protected cacheTtl: number;

  constructor(opts: ScraperOptions = {}) {
    this.queue = new PQueue({
      concurrency: opts.concurrency ?? 1,
      interval: opts.intervalMs ?? 1000,
      intervalCap: 1,
    });
    this.maxRetries = opts.maxRetries ?? 3;
    this.cacheTtl = opts.cacheTtlSeconds ?? 3600;
  }

  /** Run a function through the rate-limited queue with retry */
  protected async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return this.queue.add(() =>
      pRetry(fn, {
        retries: this.maxRetries,
        minTimeout: 1000,
        factor: 2,
        onFailedAttempt: (ctx) => {
          console.warn(
            `Scraper retry ${ctx.attemptNumber}/${this.maxRetries}: ${ctx.error.message}`,
          );
        },
      }),
    ) as Promise<T>;
  }

  /** Get cached value or fetch and cache */
  protected async cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const cacheKey = `scraper:${key}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as T;
    }

    const result = await fn();
    await redis.set(cacheKey, JSON.stringify(result), 'EX', this.cacheTtl);
    return result;
  }
}

import { request } from 'undici';
import { BaseScraper, randomUserAgent } from './base.js';

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  subreddit: string;
  author: string;
  score: number;
  numComments: number;
  url: string;
  createdUtc: number;
  permalink: string;
}

export interface RedditComment {
  id: string;
  body: string;
  author: string;
  score: number;
  createdUtc: number;
}

export class RedditScraper extends BaseScraper {
  private baseUrl = 'https://www.reddit.com';

  constructor() {
    super({ concurrency: 1, intervalMs: 2000, cacheTtlSeconds: 7200 });
  }

  /** Search Reddit for posts about a topic */
  async search(
    query: string,
    opts: { subreddit?: string; sort?: 'relevance' | 'hot' | 'top' | 'new'; limit?: number } = {},
  ): Promise<RedditPost[]> {
    const { subreddit, sort = 'relevance', limit = 25 } = opts;

    const sub = subreddit ? `/r/${subreddit}` : '';

    return this.cached(`reddit:search:${query}:${subreddit ?? 'all'}:${sort}:${limit}`, () =>
      this.enqueue(async () => {
        const url = `${this.baseUrl}${sub}/search.json?q=${encodeURIComponent(query)}&sort=${sort}&limit=${limit}&restrict_sr=${subreddit ? 'on' : 'off'}`;
        const { body } = await request(url, {
          headers: { 'User-Agent': randomUserAgent() },
        });
        const data = (await body.json()) as {
          data: {
            children: Array<{
              data: {
                id: string;
                title: string;
                selftext: string;
                subreddit: string;
                author: string;
                score: number;
                num_comments: number;
                url: string;
                created_utc: number;
                permalink: string;
              };
            }>;
          };
        };

        return data.data.children.map((child) => ({
          id: child.data.id,
          title: child.data.title,
          selftext: child.data.selftext,
          subreddit: child.data.subreddit,
          author: child.data.author,
          score: child.data.score,
          numComments: child.data.num_comments,
          url: child.data.url,
          createdUtc: child.data.created_utc,
          permalink: child.data.permalink,
        }));
      }),
    );
  }

  /** Get comments from a Reddit post */
  async getComments(
    permalink: string,
    opts: { limit?: number } = {},
  ): Promise<RedditComment[]> {
    const { limit = 50 } = opts;

    return this.cached(`reddit:comments:${permalink}:${limit}`, () =>
      this.enqueue(async () => {
        const url = `${this.baseUrl}${permalink}.json?limit=${limit}`;
        const { body } = await request(url, {
          headers: { 'User-Agent': randomUserAgent() },
        });
        const data = (await body.json()) as Array<{
          data: {
            children: Array<{
              kind: string;
              data: {
                id: string;
                body: string;
                author: string;
                score: number;
                created_utc: number;
              };
            }>;
          };
        }>;

        // Second element contains comments
        const commentListing = data[1];
        if (!commentListing) return [];

        return commentListing.data.children
          .filter((c) => c.kind === 't1' && c.data.body)
          .map((c) => ({
            id: c.data.id,
            body: c.data.body,
            author: c.data.author,
            score: c.data.score,
            createdUtc: c.data.created_utc,
          }));
      }),
    );
  }

  /** Search for app-related discussions to mine pain points */
  async mineAppDiscussions(
    appName: string,
    opts: { subreddits?: string[] } = {},
  ): Promise<RedditPost[]> {
    const { subreddits = ['androidapps', 'iphone', 'apps', 'Android', 'ios'] } = opts;
    const allPosts: RedditPost[] = [];

    const results = await Promise.allSettled(
      subreddits.map((sub) =>
        this.search(appName, { subreddit: sub, sort: 'relevance', limit: 10 }),
      ),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allPosts.push(...result.value);
      }
    }

    // Deduplicate by ID and sort by score
    const seen = new Set<string>();
    return allPosts
      .filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      })
      .sort((a, b) => b.score - a.score);
  }
}

/**
 * SEO Keyword Discovery Pipeline — broad web search keyword mining.
 *
 * Unlike ASO discovery (rank-verified, Play Store focused), SEO discovery
 * wants MAXIMUM coverage of real search queries for content planning:
 *
 * Sources:
 * 1. Google Suggest alphabet soup — A-Z expansion on seeds
 * 2. Deep alphabet soup — two-level recursive for broader coverage
 * 3. Question mining — "how to", "what is", "why", "can I" prefixes
 * 4. Comparison mining — "vs", "alternative to", "better than"
 * 5. Modifier mining — "best", "free", "top", "for android"
 * 6. YouTube Suggest — video content opportunities
 * 7. Related expansions — suggestions from top suggestions (recursive)
 *
 * Every keyword is a real search query from Google/YouTube autocomplete.
 * No rank verification needed — we want breadth for content strategy.
 */
import { GoogleSuggestScraper } from '../scrapers/google-suggest.js';
import { YouTubeSuggestScraper } from '../scrapers/youtube-suggest.js';
import { RedditScraper } from '../scrapers/reddit.js';

// ─── Types ───

export type SeoKeywordSource =
  | 'google_suggest'
  | 'alphabet_soup'
  | 'deep_soup'
  | 'question'
  | 'comparison'
  | 'modifier'
  | 'youtube'
  | 'related';

export type SearchIntent = 'informational' | 'transactional' | 'navigational' | 'commercial';

export type ContentType = 'blog_post' | 'landing_page' | 'faq' | 'video' | 'comparison' | 'tutorial';

export interface SeoKeyword {
  keyword: string;
  source: SeoKeywordSource;
  searchIntent: SearchIntent;
  contentType: ContentType;
  estimatedVolume: 'high' | 'medium' | 'low';
}

export interface RedditInsight {
  title: string;
  subreddit: string;
  score: number;
  numComments: number;
  url: string;
  contentAngle: string;
  suggestedContentType: ContentType;
}

// ─── Intent Classification Patterns ───

const QUESTION_PREFIXES = [
  'how to', 'how do', 'how can', 'how does',
  'what is', 'what are', 'what does',
  'why is', 'why does', 'why do', 'why are',
  'can i', 'can you', 'can we',
  'should i', 'should you',
  'is it', 'is there', 'are there',
  'which is', 'which are',
  'where to', 'where can',
  'when to', 'when should',
  'does', 'do i need',
];

const COMPARISON_MODIFIERS = [
  'vs', 'versus', 'or',
  'alternative', 'alternatives', 'alternative to',
  'better than', 'compared to', 'comparison',
  'like', 'similar to', 'instead of',
  'switch from', 'replace',
];

const COMMERCIAL_MODIFIERS = [
  'best', 'top', 'top 10', 'top 5',
  'free', 'cheap', 'affordable', 'premium',
  'for android', 'for iphone', 'for ios',
  'for beginners', 'for students', 'for business', 'for couples', 'for families',
  'for small business', 'for freelancers',
  'with', 'without ads', 'no ads',
  'offline', 'open source',
];

const TRANSACTIONAL_SIGNALS = [
  'download', 'install', 'get', 'buy', 'try',
  'sign up', 'subscribe', 'pricing', 'cost',
];

// ─── SEO Keyword Discoverer ───

// Reddit subreddits relevant for app/software/finance topics
const REDDIT_SUBREDDITS = [
  'androidapps', 'Android', 'apps',
  'personalfinance', 'ynab', 'budgeting', 'frugal',
  'productivity', 'selfimprovement',
];


export class SeoKeywordDiscoverer {
  private googleSuggest = new GoogleSuggestScraper();
  private youtubeSuggest = new YouTubeSuggestScraper();
  private reddit = new RedditScraper();

  /**
   * Full SEO keyword discovery from seed keywords.
   * Returns keywords from autocomplete sources + Reddit content insights.
   *
   * Focused approach: only alphabet soup on multi-word seeds (specific enough).
   * Single-word seeds get direct suggest only (no A-Z expansion that generates noise).
   */
  async discover(
    seedKeywords: string[],
    opts: { lang?: string; country?: string; appName?: string } = {},
  ): Promise<{ keywords: SeoKeyword[]; redditInsights: RedditInsight[] }> {
    const { lang = 'en', country = 'us', appName } = opts;
    const allKeywords = new Map<string, SeoKeyword>();
    const seeds = seedKeywords.slice(0, 5).map((s) => s.toLowerCase().trim());

    // ── 1. Google Suggest — alphabet soup only on multi-word seeds ──
    for (const seed of seeds) {
      const isMultiWord = seed.split(/\s+/).length >= 2;

      if (isMultiWord) {
        // Multi-word seeds are specific enough for alphabet soup
        try {
          const soupResults = await this.googleSuggest.alphabetSoup(seed, { lang, country });
          for (const kw of soupResults) {
            this.addKeyword(allKeywords, kw, 'alphabet_soup');
          }
        } catch {
          // Continue
        }
      } else {
        // Single-word seeds: direct suggest only (no A-Z expansion)
        try {
          const suggestions = await this.googleSuggest.suggest(seed, { lang, country });
          for (const kw of suggestions) {
            this.addKeyword(allKeywords, kw, 'google_suggest');
          }
        } catch {
          // Continue
        }
      }

      // "[seed] app" — always specific enough
      try {
        const appResults = await this.googleSuggest.suggest(`${seed} app`, { lang, country });
        for (const kw of appResults) {
          this.addKeyword(allKeywords, kw, 'alphabet_soup');
        }
      } catch {
        // Continue
      }
    }

    // ── 2. Question Mining (top 3 seeds, top 10 prefixes) ──
    for (const seed of seeds.slice(0, 3)) {
      for (const prefix of QUESTION_PREFIXES.slice(0, 10)) {
        try {
          const suggestions = await this.googleSuggest.suggest(`${prefix} ${seed}`, { lang, country });
          for (const kw of suggestions) {
            this.addKeyword(allKeywords, kw, 'question');
          }
        } catch {
          // Continue
        }
      }
    }

    // ── 3. Comparison Mining ──
    for (const seed of seeds.slice(0, 3)) {
      for (const modifier of COMPARISON_MODIFIERS.slice(0, 6)) {
        try {
          const suggestions = await this.googleSuggest.suggest(`${seed} ${modifier}`, { lang, country });
          for (const kw of suggestions) {
            this.addKeyword(allKeywords, kw, 'comparison');
          }
        } catch {
          // Continue
        }
      }
    }

    // App name "vs" comparisons
    if (appName) {
      try {
        const vsSuggestions = await this.googleSuggest.suggest(`${appName} vs`, { lang, country });
        for (const kw of vsSuggestions) {
          this.addKeyword(allKeywords, kw, 'comparison');
        }
      } catch {
        // Continue
      }
    }

    // ── 4. Commercial Modifier Mining (top 10 modifiers only) ──
    for (const seed of seeds.slice(0, 3)) {
      for (const modifier of COMMERCIAL_MODIFIERS.slice(0, 10)) {
        try {
          const suggestions = await this.googleSuggest.suggest(`${modifier} ${seed}`, { lang, country });
          for (const kw of suggestions) {
            if (!allKeywords.has(kw.toLowerCase())) {
              this.addKeyword(allKeywords, kw, 'modifier');
            }
          }
        } catch {
          // Continue
        }
      }
    }

    // ── 5. YouTube Suggest (direct suggest, no alphabet soup) ──
    for (const seed of seeds.slice(0, 3)) {
      try {
        const ytResults = await this.youtubeSuggest.suggest(seed, { lang, country });
        for (const kw of ytResults) {
          if (!allKeywords.has(kw.toLowerCase())) {
            this.addKeyword(allKeywords, kw, 'youtube');
          }
        }
      } catch {
        // Continue
      }

      try {
        const howTo = await this.youtubeSuggest.suggest(`how to ${seed}`, { lang, country });
        for (const kw of howTo) {
          if (!allKeywords.has(kw.toLowerCase())) {
            this.addKeyword(allKeywords, kw, 'youtube');
          }
        }
      } catch {
        // Continue
      }
    }

    // ── 6. Reddit Mining (content ideas, pain points) ──
    const redditInsights: RedditInsight[] = [];
    const seenPostIds = new Set<string>();

    for (const seed of seeds.slice(0, 3)) {
      try {
        const allPosts: typeof posts = [];
        const posts = await this.reddit.search(seed, { sort: 'relevance', limit: 25 });
        allPosts.push(...posts);

        for (const sub of REDDIT_SUBREDDITS.slice(0, 5)) {
          try {
            const subPosts = await this.reddit.search(seed, { subreddit: sub, sort: 'top', limit: 15 });
            allPosts.push(...subPosts);
          } catch {
            // Continue
          }
        }

        const qualityPosts = allPosts
          .filter((p) => {
            if (seenPostIds.has(p.id)) return false;
            seenPostIds.add(p.id);
            return p.score >= 5 || p.numComments >= 3;
          })
          .sort((a, b) => (b.score + b.numComments * 2) - (a.score + a.numComments * 2))
          .slice(0, 20);

        for (const post of qualityPosts) {
          const insight = this.postToInsight(post);
          if (insight) redditInsights.push(insight);
        }
      } catch {
        // Continue
      }
    }

    if (appName) {
      try {
        const appPosts = await this.reddit.search(appName, { sort: 'relevance', limit: 15 });
        const quality = appPosts
          .filter((p) => !seenPostIds.has(p.id) && (p.score >= 3 || p.numComments >= 2))
          .sort((a, b) => b.score - a.score)
          .slice(0, 10);
        for (const post of quality) {
          seenPostIds.add(post.id);
          const insight = this.postToInsight(post);
          if (insight) redditInsights.push(insight);
        }
      } catch {
        // Continue
      }
    }

    return {
      keywords: Array.from(allKeywords.values()),
      redditInsights,
    };
  }

  // ─── Private helpers ───

  /** Add a keyword to the map with classification */
  private addKeyword(
    map: Map<string, SeoKeyword>,
    keyword: string,
    source: SeoKeywordSource,
  ): void {
    const lower = keyword.toLowerCase().trim();
    if (lower.length < 3 || lower.length > 80) return;
    if (map.has(lower)) return;

    const intent = this.classifyIntent(lower);
    const contentType = this.suggestContentType(lower, intent, source);
    const volume = this.estimateVolume(lower, source);

    map.set(lower, {
      keyword: lower,
      source,
      searchIntent: intent,
      contentType,
      estimatedVolume: volume,
    });
  }

  /** Classify search intent from keyword text */
  private classifyIntent(keyword: string): SearchIntent {
    const lower = keyword.toLowerCase();

    // Navigational — looking for a specific app/brand
    if (lower.includes('login') || lower.includes('sign in') || lower.includes('download') ||
        lower.includes('.com') || lower.includes('official')) {
      return 'navigational';
    }

    // Transactional — ready to take action
    for (const signal of TRANSACTIONAL_SIGNALS) {
      if (lower.includes(signal)) return 'transactional';
    }

    // Informational — questions, how-to, what-is
    for (const prefix of QUESTION_PREFIXES) {
      if (lower.startsWith(prefix)) return 'informational';
    }
    if (lower.includes('tutorial') || lower.includes('guide') || lower.includes('tips') ||
        lower.includes('meaning') || lower.includes('definition') || lower.includes('example')) {
      return 'informational';
    }

    // Commercial — comparing, evaluating options
    for (const mod of COMPARISON_MODIFIERS) {
      if (lower.includes(mod)) return 'commercial';
    }
    if (lower.startsWith('best ') || lower.startsWith('top ') || lower.includes('review') ||
        lower.includes('recommend')) {
      return 'commercial';
    }

    // Default: informational (most web searches are)
    return 'informational';
  }

  /** Suggest content type based on keyword characteristics */
  private suggestContentType(keyword: string, intent: SearchIntent, source: SeoKeywordSource): ContentType {
    const lower = keyword.toLowerCase();

    // YouTube source → video
    if (source === 'youtube') return 'video';

    // Questions → FAQ or tutorial
    for (const prefix of QUESTION_PREFIXES) {
      if (lower.startsWith(prefix)) {
        if (lower.startsWith('how to') || lower.startsWith('how do') || lower.startsWith('how can')) {
          return 'tutorial';
        }
        return 'faq';
      }
    }

    // Comparisons → comparison page
    for (const mod of COMPARISON_MODIFIERS) {
      if (lower.includes(` ${mod} `) || lower.includes(` ${mod}`)) {
        return 'comparison';
      }
    }

    // Commercial intent → landing page
    if (intent === 'commercial' || intent === 'transactional') {
      return 'landing_page';
    }

    // Default: blog post
    return 'blog_post';
  }

  /** Estimate search volume based on source and keyword characteristics */
  private estimateVolume(keyword: string, source: SeoKeywordSource): 'high' | 'medium' | 'low' {
    const wordCount = keyword.split(/\s+/).length;

    // Short keywords from Google Suggest base results = high volume
    if (source === 'google_suggest' && wordCount <= 3) return 'high';
    if (source === 'alphabet_soup' && wordCount <= 2) return 'high';

    // Medium-length keywords or from secondary sources
    if (wordCount <= 3) return 'medium';
    if (source === 'youtube') return 'medium';
    if (source === 'question' && wordCount <= 5) return 'medium';
    // Long-tail = low volume but often high conversion
    return 'low';
  }

  /** Convert a Reddit post into a content insight */
  private postToInsight(post: { title: string; subreddit: string; score: number; numComments: number; permalink: string }): RedditInsight | null {
    const title = post.title.trim();
    if (title.length < 10 || title.length > 300) return null;

    // Determine content angle from post title patterns
    const lower = title.toLowerCase();
    let contentAngle: string;
    let contentType: ContentType;

    if (lower.includes('?') || lower.startsWith('how') || lower.startsWith('what') ||
        lower.startsWith('why') || lower.startsWith('is there') || lower.startsWith('does anyone')) {
      contentAngle = 'Answer this question in a blog post or FAQ';
      contentType = lower.startsWith('how') ? 'tutorial' : 'faq';
    } else if (lower.includes(' vs ') || lower.includes(' or ') || lower.includes('alternative') ||
               lower.includes('compared') || lower.includes('switch from')) {
      contentAngle = 'Write a comparison or alternatives article';
      contentType = 'comparison';
    } else if (lower.includes('best ') || lower.includes('top ') || lower.includes('recommend') ||
               lower.includes('suggestion') || lower.includes('looking for')) {
      contentAngle = 'Create a "best of" listicle or recommendation guide';
      contentType = 'blog_post';
    } else if (lower.includes('tip') || lower.includes('trick') || lower.includes('guide') ||
               lower.includes('tutorial') || lower.includes('learn')) {
      contentAngle = 'Write a how-to guide or tutorial';
      contentType = 'tutorial';
    } else if (lower.includes('review') || lower.includes('experience') || lower.includes('opinion')) {
      contentAngle = 'Write a detailed review or case study';
      contentType = 'blog_post';
    } else {
      contentAngle = 'Address this topic in a blog post';
      contentType = 'blog_post';
    }

    return {
      title,
      subreddit: post.subreddit,
      score: post.score,
      numComments: post.numComments,
      url: `https://www.reddit.com${post.permalink}`,
      contentAngle,
      suggestedContentType: contentType,
    };
  }
}

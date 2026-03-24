/**
 * Content analysis for ASO: keyword density, N-gram extraction,
 * common keyword frequency across competitor titles.
 */

// ─── Stop words ───
// Comprehensive list: standard English + app-store-specific + generic verbs/nouns
// that are NEVER useful as standalone ASO keywords.
const STOP_WORDS = new Set([
  // Articles, prepositions, conjunctions, pronouns
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'cannot', 'could', 'did', 'do', 'does', 'doing', 'done', 'down', 'during',
  'each', 'even', 'every', 'few', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself',
  'just',
  'me', 'might', 'more', 'most', 'much', 'must', 'my', 'myself',
  'no', 'nor', 'not',
  'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'shall', 'she', 'should', 'so', 'some', 'such',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they',
  'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'upon',
  'very',
  'was', 'we', 'well', 'were', 'what', 'when', 'where', 'whether', 'which', 'while', 'who', 'whom', 'why',
  'will', 'with', 'within', 'without', 'would',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  // Generic verbs — too vague to be ASO keywords alone
  'add', 'allow', 'allows', 'bring', 'change', 'check', 'choose', 'click', 'close', 'come',
  'copy', 'create', 'delete', 'edit', 'enter', 'find', 'give', 'go', 'help', 'hide',
  'hold', 'keep', 'know', 'leave', 'let', 'like', 'look', 'love', 'made', 'make',
  'manage', 'move', 'need', 'offer', 'offers', 'open', 'paste', 'pick', 'play', 'provides',
  'put', 'read', 'remove', 'save', 'scroll', 'see', 'select', 'send', 'set', 'share',
  'show', 'start', 'stay', 'stop', 'swipe', 'switch', 'take', 'tap', 'think', 'track',
  'turn', 'view', 'want', 'watch', 'work', 'write',
  // Generic nouns — not searchable keywords
  'access', 'account', 'anything', 'area', 'button', 'color', 'control', 'data', 'date', 'dates',
  'day', 'days', 'design', 'device', 'email', 'everything', 'experience', 'feature', 'features',
  'field', 'form', 'function', 'goal', 'goals', 'home', 'hour', 'hours', 'info', 'internet',
  'item', 'items', 'kind', 'level', 'life', 'list', 'login', 'main', 'menu', 'minute', 'minutes',
  'mobile', 'mode', 'month', 'months', 'notification', 'option', 'options', 'page', 'part', 'parts',
  'password', 'people', 'person', 'phone', 'place', 'plan', 'point', 'problem', 'profile',
  'result', 'results', 'screen', 'section', 'service', 'setting', 'settings', 'solution', 'something',
  'step', 'stick', 'style', 'support', 'system', 'thing', 'things', 'time', 'times', 'today',
  'tool', 'type', 'types', 'user', 'users', 'value', 'way', 'ways', 'week', 'weeks', 'world',
  'year', 'years',
  // Generic adjectives/adverbs
  'able', 'already', 'also', 'always', 'amazing', 'awesome', 'available', 'based', 'beautiful',
  'big', 'built', 'complete', 'cool', 'different', 'directly', 'easily', 'entire', 'extra',
  'first', 'full', 'good', 'great', 'helpful', 'high', 'important', 'included', 'including',
  'large', 'last', 'less', 'long', 'low', 'many', 'multiple', 'never', 'next', 'nice',
  'often', 'old', 'one', 'online', 'offline', 'perfect', 'possible', 'powerful', 'quick',
  'real', 'really', 'right', 'short', 'simply', 'single', 'small', 'smart', 'special',
  'still', 'total', 'true', 'unique', 'useful', 'usually', 'whole',
  // App store / marketing filler
  'app', 'apps', 'application', 'best', 'download', 'easy', 'fast', 'free', 'get', 'install',
  'latest', 'lite', 'new', 'now', 'official', 'original', 'plus', 'premium', 'pro',
  'simple', 'top', 'update', 'upgrade', 'use', 'version',
  // Numbers
  'one', 'two', 'three', 'four', 'five',
]);

// ─── Types ───

export interface DensityResult {
  keyword: string;
  count: number;
  density: number;
  totalWords: number;
}

export interface NgramResult {
  unigrams: NgramEntry[];
  bigrams: NgramEntry[];
  trigrams: NgramEntry[];
}

export interface NgramEntry {
  phrase: string;
  count: number;
}

export interface CommonKeyword {
  word: string;
  count: number;
}

// ─── ContentAnalyzer ───

export class ContentAnalyzer {
  /** Calculate keyword density in text using regex word boundary matching. */
  calculateDensity(text: string, keyword: string): DensityResult {
    if (!text || !keyword) return { keyword, count: 0, density: 0, totalWords: 0 };

    const normalizedText = text.toLowerCase();
    const normalizedKeyword = keyword.toLowerCase();

    const words = normalizedText.replace(/[^\w\s]/g, '').split(/\s+/).filter((w) => w.length > 0);
    const totalWords = words.length;
    if (totalWords === 0) return { keyword, count: 0, density: 0, totalWords: 0 };

    const regex = new RegExp(`\\b${escapeRegExp(normalizedKeyword)}\\b`, 'g');
    const matches = normalizedText.match(regex);
    const count = matches ? matches.length : 0;

    // density = (occurrences × keyword_word_count / total_words) × 100
    const keywordWordCount = normalizedKeyword.split(' ').length;
    const density = (count * keywordWordCount / totalWords) * 100;

    return { keyword, count, density: Math.round(density * 100) / 100, totalWords };
  }

  /** Calculate density for multiple keywords at once. */
  calculateMultiKeywordDensity(text: string, keywords: string[]): DensityResult[] {
    return keywords.map((kw) => this.calculateDensity(text, kw));
  }

  /** Extract N-grams (uni/bi/trigrams) with stop word filtering. */
  analyzeNgrams(text: string, limit = 10): NgramResult {
    if (!text) return { unigrams: [], bigrams: [], trigrams: [] };

    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 0);

    return {
      unigrams: this.getTopNgrams(words, 1, limit),
      bigrams: this.getTopNgrams(words, 2, limit),
      trigrams: this.getTopNgrams(words, 3, limit),
    };
  }

  /** Extract most frequent keywords across a set of competitor titles. */
  extractCommonKeywords(titles: string[], limit = 15): CommonKeyword[] {
    const frequency: Record<string, number> = {};

    for (const title of titles) {
      const words = title
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

      // Use a Set so each title contributes at most 1 count per word
      const unique = new Set(words);
      for (const word of unique) {
        frequency[word] = (frequency[word] ?? 0) + 1;
      }
    }

    return Object.entries(frequency)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /** Extract candidate keywords from text (for discovery pipeline). */
  extractKeywords(text: string, limit = 20): string[] {
    if (!text) return [];

    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    // Count frequency
    const freq: Record<string, number> = {};
    for (const w of words) {
      freq[w] = (freq[w] ?? 0) + 1;
    }

    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([word]) => word);
  }

  /** Get optimal keyword density range for a placement type. */
  getOptimalDensityRange(placement: 'title' | 'short_description' | 'description'): {
    min: number;
    max: number;
    target: number;
  } {
    switch (placement) {
      case 'title':
        return { min: 15, max: 40, target: 25 };
      case 'short_description':
        return { min: 8, max: 20, target: 12 };
      case 'description':
        return { min: 2, max: 4, target: 3 };
    }
  }

  /** Check if a word is a stop word. */
  isStopWord(word: string): boolean {
    return STOP_WORDS.has(word.toLowerCase());
  }

  // ─── Private ───

  private getTopNgrams(words: string[], n: number, limit: number): NgramEntry[] {
    const frequency: Record<string, number> = {};

    for (let i = 0; i <= words.length - n; i++) {
      const ngram = words.slice(i, i + n);

      if (this.isStopWordNgram(ngram)) continue;

      const phrase = ngram.join(' ');
      frequency[phrase] = (frequency[phrase] ?? 0) + 1;
    }

    return Object.entries(frequency)
      .map(([phrase, count]) => ({ phrase, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  private isStopWordNgram(ngram: string[]): boolean {
    // Skip if any word < 2 chars (unless numeric)
    if (ngram.some((w) => w.length < 2 && isNaN(Number(w)))) return true;

    if (ngram.length === 1) {
      return STOP_WORDS.has(ngram[0]!);
    }

    // For multi-word: skip if starts or ends with stop word
    return STOP_WORDS.has(ngram[0]!) || STOP_WORDS.has(ngram[ngram.length - 1]!);
  }
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const contentAnalyzer = new ContentAnalyzer();

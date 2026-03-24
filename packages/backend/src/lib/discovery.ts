/**
 * Keyword discovery pipeline — rank-verified approach.
 *
 * Core philosophy: a keyword is only worth tracking if at least one known app
 * (ours or a competitor) actually ranks for it in the Play Store. This single
 * rule eliminates branded junk, irrelevant long-tail, and noise.
 *
 * Flow per competitor:
 * 1. Extract keyword candidates from title/description (n-grams + single words)
 * 2. Get Play Store autocomplete suggestions (real search queries)
 * 3. For each candidate, search Play Store → find if the competitor ranks
 * 4. Only keep keywords where the competitor ranks (validates quality)
 * 5. Also record our rank + best competitor rank from the same search
 *
 * This mirrors how aso-agent achieves high-quality keyword discovery.
 */
import { PlayStoreDetailsScraper, PlayStoreSearchScraper, PlayStoreSuggestScraper } from '../scrapers/playstore/index.js';
import { GoogleSuggestScraper } from '../scrapers/google-suggest.js';
import { contentAnalyzer } from './analyzer.js';

// ─── Types ───

export interface DiscoveredKeyword {
  keyword: string;
  rank: number | null;
  bestCompRank: number | null;
  bestCompPackage: string | null;
  totalResults: number;
  difficulty: number | null;
  source: 'title' | 'description' | 'autocomplete' | 'play_autocomplete' | 'play_alphabet_soup' | 'ngram' | 'common' | 'suggest' | 'alphabet_soup';
  sourceAppId?: string;
}

// Stop words — never useful as standalone ASO keywords
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'your', 'you', 'app', 'free',
  'best', 'new', 'pro', 'plus', 'premium', 'lite', 'now',
  'this', 'that', 'from', 'have', 'has', 'had', 'are', 'was',
  'were', 'been', 'being', 'can', 'could', 'will', 'would',
  'should', 'may', 'might', 'must', 'shall', 'into', 'than',
  'then', 'them', 'they', 'their', 'there', 'these', 'those',
  'what', 'which', 'who', 'whom', 'whose', 'when', 'where',
  'why', 'how', 'all', 'each', 'any', 'both', 'few', 'some',
  'such', 'only', 'own', 'same', 'also', 'very', 'most',
  'other', 'over', 'about', 'after', 'before', 'between',
  'under', 'above', 'below', 'does', 'did', 'doing', 'done',
  'not', 'nor', 'but', 'yet', 'because', 'while', 'during',
]);


// ─── KeywordDiscoverer ───

export class KeywordDiscoverer {
  private playDetails = new PlayStoreDetailsScraper();
  private playSearch = new PlayStoreSearchScraper();
  private playSuggest = new PlayStoreSuggestScraper();
  private googleSuggest = new GoogleSuggestScraper();

  /**
   * Discover keywords for a single app (aso-agent approach).
   * Returns only keywords where THIS app actually ranks in Play Store search.
   * Called once per competitor — "check my ranks" is a separate step.
   */
  async discover(
    appId: string,
    opts: { lang?: string; country?: string } = {},
  ): Promise<{ keyword: string; rank: number; totalResults: number }[]> {
    const { lang = 'en', country = 'us' } = opts;

    // 1. Fetch app metadata
    const details = await this.playDetails.getAppDetails(appId, lang, country);
    if (!details?.title) return [];

    const candidates = new Set<string>();

    // 2. Extract keywords from title (no junk filter — rank-verification is the quality gate)
    const titleKeywords = this.extractKeywordsLight(details.title);
    titleKeywords.forEach((w) => candidates.add(w));

    // 3. Extract from short description (top 15)
    if (details.shortDescription) {
      this.extractKeywordsLight(details.shortDescription)
        .slice(0, 15)
        .forEach((w) => candidates.add(w));
    }

    // 3b. Extract from full description (top 10)
    if (details.description) {
      this.extractKeywordsLight(details.description)
        .slice(0, 10)
        .forEach((w) => candidates.add(w));
    }

    // 4. Generate 2-word and 3-word combinations from title
    const titleWords = details.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    for (let i = 0; i < titleWords.length - 1; i++) {
      candidates.add(`${titleWords[i]} ${titleWords[i + 1]}`);
    }
    for (let i = 0; i < titleWords.length - 2; i++) {
      candidates.add(`${titleWords[i]} ${titleWords[i + 1]} ${titleWords[i + 2]}`);
    }

    // 5. Get Play Store autocomplete for top 5 title keywords
    const coreKws = titleKeywords.slice(0, 5);
    console.log(`[discover] App ${appId}: ${candidates.size} candidates before autocomplete, core keywords: [${coreKws.join(', ')}]`);
    for (const keyword of coreKws) {
      try {
        const suggestions = await this.playSuggest.suggest(keyword, { lang, country });
        console.log(`[discover] Autocomplete "${keyword}": ${suggestions.length} suggestions → [${suggestions.slice(0, 3).join(', ')}...]`);
        suggestions.slice(0, 8).forEach((s) => {
          const sLower = s.toLowerCase().trim();
          if (sLower.length >= 3 && sLower.length <= 50) {
            candidates.add(sLower);
          }
        });
      } catch (err) {
        console.error(`[discover] Autocomplete FAILED for "${keyword}":`, (err as Error).message);
      }
    }
    console.log(`[discover] App ${appId}: ${candidates.size} candidates after autocomplete`);

    // 6. Filter candidates (no hard cap — rank-verification is the quality gate)
    const candidateList = Array.from(candidates)
      .filter((k) => k.length >= 3 && k.length <= 50);

    // 7. Rank-verify: search Play Store, check if THIS app ranks
    const results: { keyword: string; rank: number; totalResults: number }[] = [];

    for (let i = 0; i < candidateList.length; i += 5) {
      const chunk = candidateList.slice(i, i + 5);
      const chunkResults = await Promise.allSettled(
        chunk.map(async (keyword) => {
          try {
            const searchResults = await this.playSearch.search(keyword, { lang, country });
            const position = searchResults.findIndex((r) => r.appId === appId);
            if (position === -1) return null;
            return { keyword, rank: position + 1, totalResults: searchResults.length };
          } catch {
            return null;
          }
        }),
      );

      for (const result of chunkResults) {
        if (result.status === 'fulfilled' && result.value !== null) {
          results.push(result.value);
        }
      }
    }

    return results.sort((a, b) => a.rank - b.rank);
  }

  /**
   * Check where a specific app ranks for a list of keywords.
   * Separate step from discovery (aso-agent's "check my ranks").
   */
  async checkRanks(
    appId: string,
    keywords: string[],
    opts: { lang?: string; country?: string } = {},
  ): Promise<{ keyword: string; rank: number; totalResults: number }[]> {
    const { lang = 'en', country = 'us' } = opts;
    const results: { keyword: string; rank: number; totalResults: number }[] = [];

    for (let i = 0; i < keywords.length; i += 5) {
      const chunk = keywords.slice(i, i + 5);
      const chunkResults = await Promise.allSettled(
        chunk.map(async (keyword) => {
          const searchResults = await this.playSearch.search(keyword, { lang, country });
          const position = searchResults.findIndex((r) => r.appId === appId);
          return {
            keyword,
            rank: position === -1 ? -1 : position + 1,
            totalResults: searchResults.length,
          };
        }),
      );

      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        }
      }
    }

    return results;
  }

  /**
   * Extract keyword candidates from an app's listing (title, short desc, description, n-grams).
   * Does NOT rank-verify — just returns raw candidates for external checking.
   */
  async extractCandidates(
    appId: string,
    opts: { lang?: string; country?: string } = {},
  ): Promise<string[]> {
    const { lang = 'en', country = 'us' } = opts;
    const details = await this.playDetails.getAppDetails(appId, lang, country);
    if (!details?.title) return [];

    const candidates = new Set<string>();

    // Title keywords (light filter — rank-verification is the quality gate)
    this.extractKeywordsLight(details.title).forEach((w) => candidates.add(w));

    // Title n-grams (2-word and 3-word)
    const titleWords = details.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    for (let i = 0; i < titleWords.length - 1; i++) {
      candidates.add(`${titleWords[i]} ${titleWords[i + 1]}`);
    }
    for (let i = 0; i < titleWords.length - 2; i++) {
      candidates.add(`${titleWords[i]} ${titleWords[i + 1]} ${titleWords[i + 2]}`);
    }

    // Short description (top 15)
    if (details.shortDescription) {
      this.extractKeywordsLight(details.shortDescription).slice(0, 15).forEach((w) => candidates.add(w));
    }

    // Full description (top 10)
    if (details.description) {
      this.extractKeywordsLight(details.description).slice(0, 10).forEach((w) => candidates.add(w));
    }

    // No junk filter — rank-verification is the quality gate (aso-agent approach)
    return Array.from(candidates).filter(
      (k) => k.length >= 3 && k.length <= 50,
    );
  }

  /**
   * Rank-check keywords against multiple apps at once.
   * Returns keywords where ANY of the given apps ranks.
   * For each keyword: who ranks best among the given apps.
   */
  async rankCheckMultiApp(
    keywords: string[],
    appIds: string[],
    opts: { lang?: string; country?: string } = {},
  ): Promise<{ keyword: string; bestRank: number; bestAppId: string; totalResults: number }[]> {
    const { lang = 'en', country = 'us' } = opts;
    const appSet = new Set(appIds);
    const results: { keyword: string; bestRank: number; bestAppId: string; totalResults: number }[] = [];

    for (let i = 0; i < keywords.length; i += 5) {
      const chunk = keywords.slice(i, i + 5);
      const chunkResults = await Promise.allSettled(
        chunk.map(async (keyword) => {
          try {
            const searchResults = await this.playSearch.search(keyword, { lang, country });
            let bestRank: number | null = null;
            let bestAppId: string | null = null;

            for (let j = 0; j < searchResults.length; j++) {
              if (appSet.has(searchResults[j]!.appId)) {
                const rank = j + 1;
                if (bestRank === null || rank < bestRank) {
                  bestRank = rank;
                  bestAppId = searchResults[j]!.appId;
                }
              }
            }

            if (bestRank === null) return null; // Nobody ranks
            return { keyword, bestRank, bestAppId: bestAppId!, totalResults: searchResults.length };
          } catch {
            return null;
          }
        }),
      );

      for (const result of chunkResults) {
        if (result.status === 'fulfilled' && result.value !== null) {
          results.push(result.value);
        }
      }
    }

    return results;
  }

  /**
   * Discover keywords from a single competitor app.
   * Only returns keywords where the competitor actually ranks (rank-verified).
   */
  async discoverFromApp(
    competitorPackage: string,
    myPackageName: string,
    allCompetitorPackages: string[],
    opts: { lang?: string; country?: string; maxKeywords?: number } = {},
  ): Promise<DiscoveredKeyword[]> {
    const { lang = 'en', country = 'us', maxKeywords = 40 } = opts;

    const details = await this.playDetails.getAppDetails(competitorPackage, lang, country);
    if (!details) return [];

    const candidates = new Set<string>();
    const title = details.title ?? '';
    const shortDesc = details.shortDescription ?? '';
    const description = details.description ?? '';

    // ── Step 1: Extract keyword candidates from listing ──

    // Title single words (most valuable)
    const titleWords = this.extractKeywords(title);
    titleWords.forEach((w) => candidates.add(w));

    // Title 2-word and 3-word n-grams
    const rawTitleWords = title
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i <= rawTitleWords.length - n; i++) {
        const ngram = rawTitleWords.slice(i, i + n).join(' ');
        if (ngram.length >= 5) candidates.add(ngram);
      }
    }

    // Short description keywords (max 15)
    if (shortDesc) {
      this.extractKeywords(shortDesc).slice(0, 15).forEach((w) => candidates.add(w));
    }

    // Full description keywords (max 10 — descriptions are noisy)
    if (description) {
      this.extractKeywords(description).slice(0, 10).forEach((w) => candidates.add(w));
    }

    // ── Step 2: Play Store native autocomplete suggestions ──
    const coreKeywords = titleWords.slice(0, 5);
    for (const keyword of coreKeywords) {
      try {
        const suggestions = await this.playSuggest.suggest(keyword, { lang, country });
        suggestions.slice(0, 8).forEach((s) => {
          const sLower = s.toLowerCase().trim();
          if (sLower.length >= 3 && sLower.length <= 50) {
            candidates.add(sLower);
          }
        });
      } catch {
        // Continue on suggest failure
      }
    }

    // ── Step 3: Filter and limit candidates ──
    const filtered = Array.from(candidates)
      .filter((k) => k.length >= 3 && k.length <= 50)
      .slice(0, maxKeywords);

    // ── Step 4: Rank-verify each candidate ──
    // Search Play Store for each keyword, check if the COMPETITOR ranks.
    // Also record our rank and best competitor rank from same search.
    return this.rankVerify(
      filtered,
      competitorPackage,
      myPackageName,
      allCompetitorPackages,
      { lang, country },
    );
  }

  /**
   * Discover keywords from our own app + multiple competitors.
   * Main entry point for live projects.
   */
  async discoverFromCompetitors(
    competitorPackages: string[],
    myPackageName: string,
    opts: { lang?: string; country?: string; maxKeywordsPerApp?: number } = {},
  ): Promise<{ keywords: DiscoveredKeyword[]; commonTitleKeywords: { word: string; count: number }[] }> {
    const { lang = 'en', country = 'us', maxKeywordsPerApp = 30 } = opts;
    const allKeywords = new Map<string, DiscoveredKeyword>();

    // 1. Discover from OUR OWN app (keywords where WE rank)
    try {
      const myKeywords = await this.discoverFromApp(
        myPackageName,
        myPackageName,
        competitorPackages,
        { lang, country, maxKeywords: maxKeywordsPerApp },
      );
      for (const kw of myKeywords) {
        allKeywords.set(kw.keyword, kw);
      }
    } catch {
      // Continue
    }

    // 2. Fetch competitor titles for common keyword analysis
    const competitorDetails = await Promise.allSettled(
      competitorPackages.map((pkg) => this.playDetails.getAppDetails(pkg, lang, country)),
    );

    const titles: string[] = [];
    const validCompetitors: string[] = [];

    const myDetails = await this.playDetails.getAppDetails(myPackageName, lang, country).catch(() => null);
    if (myDetails?.title) titles.push(myDetails.title);

    for (let i = 0; i < competitorDetails.length; i++) {
      const result = competitorDetails[i]!;
      if (result.status === 'fulfilled' && result.value?.title) {
        titles.push(result.value.title);
        validCompetitors.push(competitorPackages[i]!);
      }
    }

    const commonTitleKeywords = contentAnalyzer.extractCommonKeywords(titles);

    // 3. Discover from each competitor (keywords where THEY rank = validated)
    const perAppResults = await Promise.allSettled(
      validCompetitors.map((pkg) =>
        this.discoverFromApp(pkg, myPackageName, competitorPackages, {
          lang,
          country,
          maxKeywords: maxKeywordsPerApp,
        }),
      ),
    );

    for (const result of perAppResults) {
      if (result.status === 'fulfilled') {
        for (const kw of result.value) {
          if (!allKeywords.has(kw.keyword)) {
            allKeywords.set(kw.keyword, kw);
          } else {
            // Merge: keep best ranks
            const existing = allKeywords.get(kw.keyword)!;
            if (kw.rank !== null && (existing.rank === null || kw.rank < existing.rank)) {
              existing.rank = kw.rank;
            }
            if (kw.bestCompRank !== null && (existing.bestCompRank === null || kw.bestCompRank < existing.bestCompRank)) {
              existing.bestCompRank = kw.bestCompRank;
              existing.bestCompPackage = kw.bestCompPackage;
            }
          }
        }
      }
    }

    // 4. Also verify ranks for common title keywords not yet discovered
    const unverified: string[] = [];
    for (const { word } of commonTitleKeywords) {
      if (word.length >= 4 && !allKeywords.has(word) && !STOP_WORDS.has(word)) {
        unverified.push(word);
      }
    }

    if (unverified.length > 0) {
      const verified = await this.batchRankCheck(
        unverified.slice(0, 20),
        myPackageName,
        competitorPackages,
        { lang, country },
      );
      for (const [keyword, data] of verified) {
        // Only include if someone ranks
        if (data.myRank !== null || data.bestCompRank !== null) {
          allKeywords.set(keyword, {
            keyword,
            rank: data.myRank,
            bestCompRank: data.bestCompRank,
            bestCompPackage: data.bestCompPackage,
            totalResults: data.totalResults,
            difficulty: this.computeDifficulty(data.totalResults),
            source: 'common',
          });
        }
      }
    }

    // Sort: ranked first (ascending), then by best competitor rank
    const keywords = Array.from(allKeywords.values()).sort((a, b) => {
      const aRank = a.rank ?? 999;
      const bRank = b.rank ?? 999;
      if (aRank !== bRank) return aRank - bRank;
      return (a.bestCompRank ?? 999) - (b.bestCompRank ?? 999);
    });

    return { keywords, commonTitleKeywords };
  }

  /**
   * Discover keywords for a pre-launch app using seed keywords.
   * No live app — we mine autocomplete + competitor listings.
   * Quality gate: only keep keywords where at least one competitor ranks.
   */
  async discoverFromSeedKeywords(
    seedKeywords: string[],
    competitorPackages: string[],
    opts: { lang?: string; country?: string } = {},
  ): Promise<{ keywords: DiscoveredKeyword[]; commonTitleKeywords: { word: string; count: number }[] }> {
    const { lang = 'en', country = 'us' } = opts;
    const candidates = new Set<string>();

    console.log(`[pre-launch] Starting discovery with ${seedKeywords.length} seeds, ${competitorPackages.length} competitors`);

    // 1. Play Store autocomplete for each seed
    for (const seed of seedKeywords.slice(0, 7)) {
      const seedLower = seed.toLowerCase().trim();
      if (seedLower.length >= 3) candidates.add(seedLower);

      // Direct suggest (fast — single browser interaction)
      try {
        const suggestions = await this.playSuggest.suggest(seedLower, { lang, country });
        console.log(`[pre-launch] Play suggest "${seedLower}": ${suggestions.length} suggestions`);
        for (const s of suggestions) {
          const sLower = s.toLowerCase().trim();
          if (sLower.length >= 3 && sLower.length <= 50) candidates.add(sLower);
        }
      } catch {
        // Continue
      }
    }

    // 2. Alphabet soup on top 3 seeds only (each one types a-z = 26 calls, so limit total)
    for (const seed of seedKeywords.slice(0, 3)) {
      const seedLower = seed.toLowerCase().trim();
      const soupSeed = seedLower.split(/\s+/).length <= 2
        ? seedLower
        : this.splitIntoShortSeeds(seedLower)[0];

      if (!soupSeed) continue;
      try {
        const soupResults = await this.playSuggest.alphabetSoup(soupSeed, { lang, country });
        console.log(`[pre-launch] Play Store alphabet soup "${soupSeed}": ${soupResults.length} suggestions`);
        for (const s of soupResults) {
          const sLower = s.toLowerCase().trim();
          if (sLower.length >= 3 && sLower.length <= 50) candidates.add(sLower);
        }
      } catch {
        // Continue
      }
    }

    console.log(`[pre-launch] ${candidates.size} candidates after autocomplete mining`);

    // 2. Discover from competitors (if any)
    let commonTitleKeywords: { word: string; count: number }[] = [];

    if (competitorPackages.length > 0) {
      const competitorDetailsList = await Promise.allSettled(
        competitorPackages.map((pkg) => this.playDetails.getAppDetails(pkg, lang, country)),
      );

      const titles: string[] = [];
      const validCompetitors: string[] = [];

      for (let i = 0; i < competitorDetailsList.length; i++) {
        const result = competitorDetailsList[i]!;
        if (result.status === 'fulfilled' && result.value?.title) {
          titles.push(result.value.title);
          validCompetitors.push(competitorPackages[i]!);

          // Extract keywords from competitor titles/descs
          const details = result.value;
          this.extractKeywordsLight(details.title ?? '').forEach((w) => candidates.add(w));
          if (details.shortDescription) {
            this.extractKeywordsLight(details.shortDescription).slice(0, 15).forEach((w) => candidates.add(w));
          }
          if (details.description) {
            this.extractKeywordsLight(details.description).slice(0, 10).forEach((w) => candidates.add(w));
          }

          // Title n-grams (2 and 3 word combos)
          const tw = (details.title ?? '')
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 2);
          for (let n = 2; n <= 3; n++) {
            for (let j = 0; j <= tw.length - n; j++) {
              const ngram = tw.slice(j, j + n).join(' ');
              if (ngram.length >= 5) candidates.add(ngram);
            }
          }
        }
      }

      console.log(`[pre-launch] ${candidates.size} candidates after competitor mining (${validCompetitors.length} valid competitors)`);

      if (titles.length > 0) {
        commonTitleKeywords = contentAnalyzer.extractCommonKeywords(titles);
        commonTitleKeywords.forEach(({ word }) => {
          if (word.length >= 4) candidates.add(word);
        });
      }
    }

    // 3. Rank-verify or accept directly
    const hasCompetitors = competitorPackages.length > 0;
    const filtered = Array.from(candidates)
      .filter((k) => k.length >= 3 && k.length <= 50);

    const keywords: DiscoveredKeyword[] = [];

    if (hasCompetitors) {
      // With competitors: rank-verify to find which keywords competitors rank for
      const toVerify = filtered.slice(0, 120);
      console.log(`[pre-launch] ${candidates.size} total candidates, verifying ${toVerify.length} against ${competitorPackages.length} competitors`);

      const verified = await this.batchRankCheck(
        toVerify,
        '__prelaunch__',
        competitorPackages,
        { lang, country },
      );

      for (const [keyword, data] of verified) {
        if (data.bestCompRank !== null) {
          keywords.push({
            keyword,
            rank: null,
            bestCompRank: data.bestCompRank,
            bestCompPackage: data.bestCompPackage,
            totalResults: data.totalResults,
            difficulty: this.computeDifficulty(data.totalResults),
            source: candidates.has(keyword) ? this.guessSource(keyword, seedKeywords) : 'common',
          });
        }
      }
    } else {
      // No competitors, no app: autocomplete suggestions ARE real queries — keep them all
      console.log(`[pre-launch] No competitors — accepting all ${filtered.length} autocomplete keywords directly`);
      for (const keyword of filtered) {
        keywords.push({
          keyword,
          rank: null,
          bestCompRank: null,
          bestCompPackage: null,
          totalResults: 0,
          difficulty: null,
          source: this.guessSource(keyword, seedKeywords),
        });
      }
    }

    console.log(`[pre-launch] ${keywords.length} keywords total`);

    // Sort by best competitor rank if available, otherwise alphabetically
    keywords.sort((a, b) => {
      if (a.bestCompRank !== null && b.bestCompRank !== null) return a.bestCompRank - b.bestCompRank;
      if (a.bestCompRank !== null) return -1;
      if (b.bestCompRank !== null) return 1;
      return a.keyword.localeCompare(b.keyword);
    });

    return { keywords, commonTitleKeywords };
  }

  // ─── Private helpers ───

  /** Extract keywords with only stop word filter (for discover() — aso-agent approach) */
  private extractKeywordsLight(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
      .slice(0, 15);
  }

  /** Extract meaningful keywords from text (stop word + junk filtered, for other methods) */
  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
      .slice(0, 15);
  }

  /** Split a multi-word phrase into 1-2 word seeds for alphabet soup */
  private splitIntoShortSeeds(phrase: string): string[] {
    const words = phrase.split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    const seeds: string[] = [];

    // Individual words (4+ chars)
    for (const w of words) {
      if (w.length >= 4) seeds.push(w);
    }

    // 2-word combos
    for (let i = 0; i < words.length - 1; i++) {
      seeds.push(`${words[i]} ${words[i + 1]}`);
    }

    return seeds.slice(0, 4);
  }

  /** Guess the source type for a keyword based on context */
  private guessSource(keyword: string, seeds: string[]): DiscoveredKeyword['source'] {
    const lower = keyword.toLowerCase();
    for (const seed of seeds) {
      if (lower === seed.toLowerCase()) return 'title';
    }
    return 'suggest';
  }

  /** Compute rough difficulty score (0-100) from total search results */
  private computeDifficulty(totalResults: number): number {
    if (totalResults === 0) return 0;
    if (totalResults <= 10) return 15;
    if (totalResults <= 30) return 30;
    if (totalResults <= 50) return 45;
    if (totalResults <= 100) return 60;
    if (totalResults <= 200) return 75;
    return 90;
  }

  /**
   * Rank-verify keyword candidates against a source app.
   * Searches Play Store for each keyword and checks if the source app ranks.
   * Only returns keywords where the source app ranks (validates keyword quality).
   * Also records our rank and best competitor rank from same search.
   */
  private async rankVerify(
    candidates: string[],
    sourcePackage: string,
    myPackageName: string,
    allCompetitorPackages: string[],
    opts: { lang: string; country: string },
  ): Promise<DiscoveredKeyword[]> {
    const results: DiscoveredKeyword[] = [];
    const compSet = new Set(allCompetitorPackages);
    const CHUNK = 5;

    for (let i = 0; i < candidates.length; i += CHUNK) {
      const chunk = candidates.slice(i, i + CHUNK);
      const chunkResults = await Promise.allSettled(
        chunk.map(async (keyword) => {
          const searchResults = await this.playSearch.search(keyword, opts);

          // Check if the SOURCE competitor ranks (quality gate)
          const sourceIndex = searchResults.findIndex((r) => r.appId === sourcePackage);
          if (sourceIndex === -1) return null; // Source doesn't rank → skip

          // Find our rank
          const myIndex = searchResults.findIndex((r) => r.appId === myPackageName);
          const myRank = myIndex === -1 ? null : myIndex + 1;

          // Find best competitor rank (across ALL competitors)
          let bestCompRank: number | null = null;
          let bestCompPackage: string | null = null;
          for (let j = 0; j < searchResults.length; j++) {
            if (compSet.has(searchResults[j]!.appId) || searchResults[j]!.appId === sourcePackage) {
              const rank = j + 1;
              if (bestCompRank === null || rank < bestCompRank) {
                bestCompRank = rank;
                bestCompPackage = searchResults[j]!.appId;
              }
            }
          }

          // If sourcePackage IS our app, use source rank as our rank
          const finalMyRank = sourcePackage === myPackageName ? sourceIndex + 1 : myRank;

          return {
            keyword,
            rank: finalMyRank,
            bestCompRank,
            bestCompPackage,
            totalResults: searchResults.length,
            difficulty: this.computeDifficulty(searchResults.length),
            source: 'play_autocomplete' as DiscoveredKeyword['source'],
            sourceAppId: sourcePackage,
          };
        }),
      );

      for (const result of chunkResults) {
        if (result.status === 'fulfilled' && result.value !== null) {
          results.push(result.value);
        }
      }
    }

    // Sort by rank (our rank first, then competitor rank)
    results.sort((a, b) => {
      const aRank = a.rank ?? 999;
      const bRank = b.rank ?? 999;
      if (aRank !== bRank) return aRank - bRank;
      return (a.bestCompRank ?? 999) - (b.bestCompRank ?? 999);
    });

    return results;
  }

  /**
   * Batch rank check for keywords — search Play Store and find both
   * our rank and best competitor rank from the same results.
   */
  private async batchRankCheck(
    keywords: string[],
    myPackageName: string,
    competitorPackages: string[],
    opts: { lang: string; country: string },
  ): Promise<Map<string, { myRank: number | null; bestCompRank: number | null; bestCompPackage: string | null; totalResults: number }>> {
    const results = new Map<string, { myRank: number | null; bestCompRank: number | null; bestCompPackage: string | null; totalResults: number }>();
    const compSet = new Set(competitorPackages);
    const CHUNK = 5;

    for (let i = 0; i < keywords.length; i += CHUNK) {
      const chunk = keywords.slice(i, i + CHUNK);
      const chunkResults = await Promise.allSettled(
        chunk.map(async (keyword) => {
          const searchResults = await this.playSearch.search(keyword, opts);

          const myIndex = searchResults.findIndex((r) => r.appId === myPackageName);
          const myRank = myIndex === -1 ? null : myIndex + 1;

          let bestCompRank: number | null = null;
          let bestCompPackage: string | null = null;
          for (let j = 0; j < searchResults.length; j++) {
            if (compSet.has(searchResults[j]!.appId)) {
              const rank = j + 1;
              if (bestCompRank === null || rank < bestCompRank) {
                bestCompRank = rank;
                bestCompPackage = searchResults[j]!.appId;
              }
            }
          }

          return { keyword, myRank, bestCompRank, bestCompPackage, totalResults: searchResults.length };
        }),
      );

      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          results.set(result.value.keyword, {
            myRank: result.value.myRank,
            bestCompRank: result.value.bestCompRank,
            bestCompPackage: result.value.bestCompPackage,
            totalResults: result.value.totalResults,
          });
        }
      }
    }

    return results;
  }
}

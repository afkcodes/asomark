import { db } from '../db/index.js';
import { apps } from '../db/schema/apps.js';
import { projects, projectCompetitors, discoveredKeywords } from '../db/schema/projects.js';
import {
  listingDrafts,
  listingVersions,
  listingVariants,
} from '../db/schema/listing-drafts.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  BaseAgent,
  type AgentContext,
  type AgentAction,
  type AgentResult,
} from './base.js';
import { PlayStoreDetailsScraper } from '../scrapers/playstore/index.js';
import { PlayStoreSearchScraper } from '../scrapers/playstore/index.js';
import { contentAnalyzer } from '../lib/analyzer.js';

// ─── Types ───

interface FilteredKeyword {
  term: string;
  relevance: number;
  intent: 'informational' | 'navigational' | 'transactional';
  placement: 'title' | 'short_description' | 'description';
  priority: 'primary' | 'secondary' | 'tertiary';
}

interface CompetitorListing {
  packageName: string;
  title: string;
  shortDescription: string;
  descriptionPreview: string;
  developer: string;
  installs: string;
  score: number;
  keywordDensities: Array<{ keyword: string; density: number; count: number }>;
  topBigrams: Array<{ phrase: string; count: number }>;
}

interface CompetitiveAnalysis {
  patterns: string[];
  commonCTAs: string[];
  toneAnalysis: string;
  gaps: string[];
  avoidPatterns: string[];
  descriptionStructure: string;
}

interface GeneratedVariant {
  title: string;
  shortDescription: string;
  fullDescription: string;
  keywordsUsed: string[];
  keywordPlacementMap: Record<string, 'title' | 'short_description' | 'description'>;
  rationale: string;
  competitiveNotes: string;
}

export interface ListingVariantReport {
  strategyName: string;
  title: string;
  shortDescription: string;
  fullDescriptionPreview: string;
  scores: {
    overall: number;
    title: number;
    shortDesc: number;
    fullDesc: number;
    coverage: number;
  };
  keywordCoverage: { found: number; total: number };
  avgDensity: number;
  rationale: string;
  warnings: string[];
}

export interface ListingCreatorReport {
  projectName: string;
  valueProposition: string;
  keywordsAnalyzed: number;
  keywordsAccepted: number;
  keywordsRejected: number;
  rejectedKeywords: Array<{ term: string; reason: string }>;
  competitorsAnalyzed: number;
  competitiveInsights: string[];
  variants: ListingVariantReport[];
  bestVariantIndex: number;
  bestVariantReason: string;
  recommendations: string[];
  versionId: string;
}

// ─── Strategy Definitions ───

const VARIANT_STRATEGIES = [
  {
    name: 'keyword_max',
    directive: `STRATEGY: Maximum Keyword Coverage
Your #1 goal is to fit as many high-priority keywords as possible into every field while maintaining natural, readable copy.
- Title: pack the top 2-3 highest-score keywords, use separator (- or :) to fit more
- Short description: use action verb + remaining primary keywords, every word must be a keyword or conversion trigger
- Full description: achieve 3-4% keyword density. Repeat each primary keyword 3-5x using variations. Use exact-match phrases in the first 167 characters.
- Use long-tail keyword phrases as subheadings in the description`,
  },
  {
    name: 'conversion',
    directive: `STRATEGY: Conversion-Focused
Your #1 goal is to maximize the install conversion rate. Keywords are secondary to compelling copy.
- Title: lead with a clear benefit statement, not just keywords. Make users WANT to click.
- Short description: address the user's #1 pain point directly. Use urgency or social proof.
- Full description: open with a powerful hook (pain point → solution). Use bullet points for features. Include social proof ("Trusted by...", "Rated..."). End with a strong CTA.
- Weave keywords naturally into benefit-driven copy rather than forcing them
- Use emotional triggers: save time, save money, simplify, peace of mind`,
  },
  {
    name: 'competitive',
    directive: `STRATEGY: Competitive Differentiation
Your #1 goal is to position the app as clearly DIFFERENT and BETTER than competitors.
- Title: include a differentiator that NO competitor uses (check the gaps analysis)
- Short description: highlight what makes this app unique vs alternatives
- Full description: explicitly address competitor weaknesses without naming them. Use phrases like "Unlike other apps...", "Finally, an app that..."
- Emphasize unique features, technology, or approach that competitors miss
- Use keyword opportunities that competitors have not optimized for`,
  },
  {
    name: 'long_tail',
    directive: `STRATEGY: Long-Tail Keyword Focus
Your #1 goal is to rank for lower-competition, high-intent long-tail keywords.
- Title: use a specific long-tail phrase instead of a generic one (e.g., "daily expense tracker for couples" vs "expense tracker")
- Short description: target 2-3 word phrases that are specific and low-competition
- Full description: naturally incorporate longer search queries and question-based keywords ("how to track expenses", "budget planner for families")
- Prioritize keywords marked as 'secondary' and 'tertiary' — these have less competition
- Use natural language that matches how users actually search`,
  },
  {
    name: 'balanced',
    directive: `STRATEGY: Balanced (Agent's Recommended Approach)
This is YOUR best judgment — the variant you would recommend to a client.
- Balance keyword density with conversion copy quality
- Front-load the single most important keyword in the title
- Use the short description for a keyword-rich benefit statement
- Full description: well-structured with hook, features, social proof, CTA — while hitting 2-3% keyword density
- Pick the keywords that have the best combination of search volume AND relevance
- This should be the most polished, professional listing overall
- Think about what would actually make someone install the app`,
  },
] as const;

// ─── Listing Creator Agent ───

export class ListingCreatorAgent extends BaseAgent {
  readonly name = 'listing-creator';
  readonly description =
    'Expert ASO listing generator with keyword intelligence and competitive analysis';

  private detailsScraper = new PlayStoreDetailsScraper();
  private searchScraper = new PlayStoreSearchScraper();

  protected getSystemPrompt(_ctx: AgentContext): string {
    return `You are an elite ASO (App Store Optimization) strategist and copywriter — the best in the world.
You don't just write listings. You engineer them for maximum discoverability AND conversion.

## Google Play Store Indexing Rules (HARD FACTS)

### What Gets Indexed:
- Title (50 characters max) — HIGHEST weight for ranking. Front-load your #1 keyword.
- Short description (80 characters max) — HIGH weight. Every word indexed. No wasted words.
- Full description (4000 characters max) — MEDIUM weight. ALL words indexed by Google's algorithm.
- Developer name — YES, it gets indexed. Exploit this if the developer name contains a keyword.

### Character Limits (NEVER exceed):
- Title: 50 characters (including spaces, separators, brand name)
- Short description: 80 characters
- Full description: 4000 characters (aim for 2500-4000)

### Keyword Density Rules:
- Target 2-4% density for primary keywords in the full description
- Repeat each primary keyword 3-5 times naturally (variations count)
- NEVER exceed 5% density for any single keyword — triggers stuffing penalty
- Don't repeat the exact same phrase more than 3 times

### First 167 Characters Rule:
The first ~167 characters of the description are visible without clicking "Read More".
This is your most valuable real estate. Pack your top keywords AND a compelling hook here.

### Title Best Practices:
- Front-load the highest-value keyword as the FIRST word (or right after brand name)
- Use separator (- or :) to fit more keywords. E.g., "BudgetBee - Expense Tracker & Budget Planner"
- Don't waste title space on generic words like "app", "best", "free"
- Every character is premium — use all 50

### Short Description Best Practices:
- Start with an action verb ("Track", "Manage", "Plan", "Save")
- NO period at the end (wastes a character)
- Every single word should be either a keyword or a conversion trigger
- This is essentially a keyword-rich tagline

### Full Description Structure:
1. **Hook** (first 167 chars): Pain point → solution, with top keywords
2. **Key Features**: 3-5 feature blocks using ★ or ✦ bullets, keywords in feature titles
3. **Why Choose Us**: Differentiators, social proof, trust signals
4. **How It Works**: Simple 3-step flow (reduces friction)
5. **CTA**: "Download [App Name] today and start [key benefit]!"

### Formatting Rules for Google Play:
- Use Unicode bullets (★ ✦ ● ◆) — they render well on Play Store
- Use CAPS for section headers sparingly (e.g., "KEY FEATURES")
- Line breaks create visual structure — use them between sections
- Emojis are OK sparingly but don't overdo them

### BANNED Words (store rejection/penalty risk):
"Best", "#1", "Free", "No Ads", "Top", "Number One", "Most Popular", "Cheapest"
These trigger review flags and look spammy. Use benefit-driven language instead.

### ASO Hacks:
1. Singular AND plural forms of keywords count as separate indexed terms. Use both.
2. Keywords in the "What's New" section also get indexed temporarily after updates.
3. The order of keywords in the title affects ranking — first words have more weight.
4. Common misspellings can be targeted in the description naturally.
5. Use your competitors' app names in description naturally (indexed, captures brand searches).

Always respond with valid JSON. No markdown fences.`;
  }

  /**
   * Generate optimized listing variants for a project.
   * Multi-step pipeline: data gathering → keyword intelligence → competitive analysis → variant generation → scoring → ranking.
   */
  async generate(
    projectId: string,
    ctx: AgentContext = {},
  ): Promise<AgentResult<ListingCreatorReport>> {
    this.resetTokens();
    const startTime = Date.now();
    const actions: AgentAction[] = [];

    // ─── Step 1: Gather Data ───

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) throw new Error(`Project ${projectId} not found`);

    const [projectApp] = await db
      .select()
      .from(apps)
      .where(eq(apps.id, project.appId));
    if (!projectApp) throw new Error('Project app not found');

    const fullCtx: AgentContext = {
      ...ctx,
      appId: project.appId,
      platform: (projectApp.platform as 'android' | 'ios') ?? 'android',
      region: project.region,
    };

    const seeds = (project.seedKeywords as string[]) ?? [];
    const category = project.category ?? projectApp.category ?? '';

    // Get discovered keywords (top 40 by rank/tracking priority)
    const discoveredKws = await db
      .select()
      .from(discoveredKeywords)
      .where(eq(discoveredKeywords.projectId, projectId))
      .orderBy(
        sql`CASE WHEN ${discoveredKeywords.isTracking} THEN 0 ELSE 1 END`,
        sql`CASE WHEN ${discoveredKeywords.myRank} IS NOT NULL THEN 0 ELSE 1 END`,
        discoveredKeywords.myRank,
      )
      .limit(40);

    if (discoveredKws.length === 0) {
      throw new Error(
        'No discovered keywords found. Run keyword discovery first.',
      );
    }

    // Get competitors
    const competitorRows = await db
      .select({ app: apps })
      .from(projectCompetitors)
      .innerJoin(apps, eq(projectCompetitors.competitorAppId, apps.id))
      .where(eq(projectCompetitors.projectId, projectId));

    const competitorPackages = competitorRows
      .map((c) => c.app.packageName)
      .filter((p): p is string => !!p);

    // Get existing draft for context
    const [existingDraft] = await db
      .select()
      .from(listingDrafts)
      .where(eq(listingDrafts.projectId, projectId))
      .orderBy(desc(listingDrafts.updatedAt))
      .limit(1);

    // ─── Step 2: Scrape Competitors ───

    const competitorListings: CompetitorListing[] = [];

    // Scrape project competitors (up to 5)
    if (competitorPackages.length > 0) {
      const details = await this.detailsScraper.getBulkDetails(
        competitorPackages.slice(0, 5),
        'en',
        project.region,
      );

      const keywordTerms = discoveredKws.map((k) => k.keyword);

      for (const app of details) {
        const densities = contentAnalyzer.calculateMultiKeywordDensity(
          `${app.title} ${app.shortDescription} ${app.description}`,
          keywordTerms.slice(0, 15),
        );
        const ngrams = contentAnalyzer.analyzeNgrams(app.description);

        competitorListings.push({
          packageName: app.appId,
          title: app.title,
          shortDescription: app.shortDescription,
          descriptionPreview: app.description.slice(0, 500),
          developer: app.developer,
          installs: app.installs,
          score: app.score,
          keywordDensities: densities,
          topBigrams: ngrams.bigrams.slice(0, 8),
        });
      }
    }

    // Also search Play Store for category leaders not yet in competitors
    if (seeds.length > 0) {
      try {
        const searchResults = await this.searchScraper.search(
          seeds[0]!,
          { country: project.region },
        );
        const newApps = searchResults
          .filter((r) => !competitorPackages.includes(r.appId))
          .slice(0, 3);

        if (newApps.length > 0) {
          const newDetails = await this.detailsScraper.getBulkDetails(
            newApps.map((a) => a.appId),
            'en',
            project.region,
          );

          const keywordTerms = discoveredKws.map((k) => k.keyword);
          for (const app of newDetails) {
            const densities = contentAnalyzer.calculateMultiKeywordDensity(
              `${app.title} ${app.shortDescription} ${app.description}`,
              keywordTerms.slice(0, 15),
            );
            const ngrams = contentAnalyzer.analyzeNgrams(app.description);

            competitorListings.push({
              packageName: app.appId,
              title: app.title,
              shortDescription: app.shortDescription,
              descriptionPreview: app.description.slice(0, 500),
              developer: app.developer,
              installs: app.installs,
              score: app.score,
              keywordDensities: densities,
              topBigrams: ngrams.bigrams.slice(0, 8),
            });
          }
        }
      } catch {
        // Non-critical, continue
      }
    }

    // Extract common keywords across all competitor titles
    const competitorTitles = competitorListings.map((c) => c.title);
    const commonTitleKeywords =
      competitorTitles.length > 0
        ? contentAnalyzer.extractCommonKeywords(competitorTitles)
        : [];

    // ─── Step 3: LLM Call 1 — Keyword Intelligence ───

    const keywordData = discoveredKws.map((k) => ({
      term: k.keyword,
      rank: k.myRank,
      source: k.source,
      isTracking: k.isTracking,
    }));

    const keywordFilterResult = await this.chatJSON<{
      valueProposition: string;
      keywords: Array<{
        term: string;
        relevance: number;
        intent: 'informational' | 'navigational' | 'transactional';
        placement: 'title' | 'short_description' | 'description';
        priority: 'primary' | 'secondary' | 'tertiary';
      }>;
      rejectedKeywords: Array<{ term: string; reason: string }>;
    }>(
      `Analyze these keywords for the app "${project.name}".
Category: ${category || 'Unknown'}
Seed keywords: ${seeds.join(', ') || 'None'}
${existingDraft?.title ? `Current draft title: "${existingDraft.title}"` : ''}

## Discovered Keywords (${keywordData.length}):
${JSON.stringify(keywordData, null, 2)}

${commonTitleKeywords.length > 0 ? `## Common Competitor Title Keywords:\n${commonTitleKeywords.map((k) => `"${k.word}" (in ${k.count} titles)`).join(', ')}` : ''}

## Your Tasks:
1. In ONE sentence, describe what this app does and who it serves (the value proposition).
2. For EACH keyword, decide:
   - relevance (0-100): how well does it match the app's actual purpose? Be strict — a keyword about "investing" is NOT relevant for an "expense tracker".
   - intent: is the user searching to learn (informational), find a specific app (navigational), or download one (transactional)?
   - placement: where should it go? "title" (only top 2-3 keywords deserve this), "short_description", or "description"
   - priority: "primary" (must include), "secondary" (should include if space), "tertiary" (nice to have)
3. REJECT keywords that don't genuinely fit this app. Be harsh — irrelevant keywords dilute listing quality.

Respond with JSON:
{
  "valueProposition": "...",
  "keywords": [{ "term": "...", "relevance": 85, "intent": "transactional", "placement": "title", "priority": "primary" }],
  "rejectedKeywords": [{ "term": "...", "reason": "..." }]
}`,
      fullCtx,
      { maxTokens: 4096 },
    );

    const filteredKeywords: FilteredKeyword[] = keywordFilterResult.keywords
      .filter((k) => k.relevance >= 30)
      .sort((a, b) => b.relevance - a.relevance);

    // ─── Step 4: LLM Call 2 — Competitive Analysis ───

    let competitiveAnalysis: CompetitiveAnalysis | null = null;

    if (competitorListings.length > 0) {
      const compData = competitorListings.slice(0, 5).map((c) => ({
        title: c.title,
        shortDescription: c.shortDescription,
        descriptionPreview: c.descriptionPreview,
        developer: c.developer,
        installs: c.installs,
        score: c.score,
        topKeywordDensities: c.keywordDensities
          .filter((d) => d.count > 0)
          .slice(0, 5),
        commonPhrases: c.topBigrams.slice(0, 5).map((b) => b.phrase),
      }));

      competitiveAnalysis = await this.chatJSON<CompetitiveAnalysis>(
        `Analyze these ${compData.length} competitor listings for "${project.name}" (${category}).

## Competitors:
${JSON.stringify(compData, null, 2)}

## Our Target Keywords (filtered for relevance):
${filteredKeywords.slice(0, 15).map((k) => `"${k.term}" (priority: ${k.priority}, placement: ${k.placement})`).join(', ')}

## Analyze:
1. patterns: What do ALL or MOST competitors do in their listings? (keyword placement, structure, tone)
2. commonCTAs: What call-to-action phrases do they use?
3. toneAnalysis: What is the overall tone? (professional, casual, technical, playful)
4. gaps: What keywords, benefits, or angles do competitors MISS that we can exploit?
5. avoidPatterns: What overused clichés or patterns should we AVOID to differentiate?
6. descriptionStructure: What description structure works best based on the successful competitors?

Respond with JSON:
{
  "patterns": ["pattern1", ...],
  "commonCTAs": ["cta1", ...],
  "toneAnalysis": "...",
  "gaps": ["gap1", ...],
  "avoidPatterns": ["pattern1", ...],
  "descriptionStructure": "..."
}`,
        fullCtx,
        { maxTokens: 2048 },
      );
    }

    // ─── Step 5: Generate Variants (Parallel) ───

    const primaryKeywords = filteredKeywords
      .filter((k) => k.priority === 'primary')
      .map((k) => k.term);
    const secondaryKeywords = filteredKeywords
      .filter((k) => k.priority === 'secondary')
      .map((k) => k.term);
    const tertiaryKeywords = filteredKeywords
      .filter((k) => k.priority === 'tertiary')
      .map((k) => k.term);

    const titleKeywords = filteredKeywords
      .filter((k) => k.placement === 'title')
      .map((k) => k.term);
    const shortDescKeywords = filteredKeywords
      .filter((k) => k.placement === 'short_description')
      .map((k) => k.term);
    const descKeywords = filteredKeywords
      .filter((k) => k.placement === 'description')
      .map((k) => k.term);

    const sharedContext = `
## App: "${project.name}"
Value proposition: ${keywordFilterResult.valueProposition}
Category: ${category || 'Unknown'}

## Keywords by Priority:
PRIMARY (must include): ${primaryKeywords.join(', ') || 'None'}
SECONDARY (should include): ${secondaryKeywords.join(', ') || 'None'}
TERTIARY (nice to have): ${tertiaryKeywords.join(', ') || 'None'}

## Keywords by Placement:
TITLE candidates: ${titleKeywords.join(', ') || 'None'}
SHORT DESC candidates: ${shortDescKeywords.join(', ') || 'None'}
DESCRIPTION candidates: ${descKeywords.join(', ') || 'None'}

${competitiveAnalysis ? `## Competitive Intelligence:
- Patterns: ${competitiveAnalysis.patterns.join('; ')}
- Gaps: ${competitiveAnalysis.gaps.join('; ')}
- Avoid: ${competitiveAnalysis.avoidPatterns.join('; ')}
- Tone: ${competitiveAnalysis.toneAnalysis}
- Recommended structure: ${competitiveAnalysis.descriptionStructure}
- Common CTAs: ${competitiveAnalysis.commonCTAs.join('; ')}` : ''}

${existingDraft?.title ? `## Existing Draft (for reference):
Title: "${existingDraft.title}"
Short: "${existingDraft.shortDescription}"
Desc preview: "${(existingDraft.fullDescription ?? '').slice(0, 200)}"` : ''}

## HARD LIMITS (NEVER exceed):
- Title: EXACTLY 50 characters max. Count every character including spaces.
- Short description: EXACTLY 80 characters max.
- Full description: 2500-4000 characters (this is the FULL description, not a preview).
- BANNED words: "Best", "#1", "Free", "No Ads", "Top", "Number One"

## FORMAT:
Respond with JSON:
{
  "title": "Your Generated Title Here",
  "shortDescription": "Your short description here",
  "fullDescription": "The COMPLETE full description (2500-4000 chars) with proper formatting, sections, and keyword density",
  "keywordsUsed": ["kw1", "kw2", ...],
  "keywordPlacementMap": { "kw1": "title", "kw2": "short_description", "kw3": "description" },
  "rationale": "Why this variant works for the chosen strategy",
  "competitiveNotes": "How this positions against competitors"
}`;

    const variantPromises = VARIANT_STRATEGIES.map((strategy) =>
      this.chatJSON<GeneratedVariant>(
        `Generate a complete store listing for this app.

${strategy.directive}

${sharedContext}`,
        fullCtx,
        { maxTokens: 6144 },
      ).catch((err) => {
        console.error(
          `Failed to generate ${strategy.name} variant:`,
          err instanceof Error ? err.message : err,
        );
        return null;
      }),
    );

    const variantResults = await Promise.allSettled(variantPromises);
    const generatedVariants: Array<{
      strategy: string;
      variant: GeneratedVariant;
    }> = [];

    for (let i = 0; i < variantResults.length; i++) {
      const result = variantResults[i]!;
      if (result.status === 'fulfilled' && result.value) {
        generatedVariants.push({
          strategy: VARIANT_STRATEGIES[i]!.name,
          variant: result.value,
        });
      }
    }

    if (generatedVariants.length === 0) {
      throw new Error('All variant generations failed');
    }

    // ─── Step 6: Post-Process & Score ───

    const allFilteredTerms = filteredKeywords.map((k) => k.term);

    // Fetch the same keyword set used by score-listing route for consistent scoring
    const dbKws = await db
      .select()
      .from(discoveredKeywords)
      .where(eq(discoveredKeywords.projectId, projectId))
      .orderBy(
        sql`CASE WHEN ${discoveredKeywords.isTracking} THEN 0 ELSE 1 END`,
        sql`CASE WHEN ${discoveredKeywords.myRank} IS NOT NULL THEN 0 ELSE 1 END`,
        discoveredKeywords.myRank,
      );
    const scoringKeywords = dbKws.slice(0, 30).map((k) => k.keyword);

    const scoredVariants: Array<{
      strategy: string;
      variant: GeneratedVariant;
      scores: NonNullable<
        (typeof listingVariants.$inferInsert)['scores']
      >;
      warnings: string[];
    }> = [];

    for (const { strategy, variant } of generatedVariants) {
      const warnings: string[] = [];

      // Enforce character limits
      if (variant.title.length > 50) {
        variant.title = variant.title.slice(0, 50).trimEnd();
        warnings.push(`Title truncated to 50 chars`);
      }
      if (variant.shortDescription.length > 80) {
        variant.shortDescription = variant.shortDescription
          .slice(0, 80)
          .trimEnd();
        warnings.push(`Short description truncated to 80 chars`);
      }
      if (variant.fullDescription.length > 4000) {
        variant.fullDescription = variant.fullDescription
          .slice(0, 4000)
          .trimEnd();
        warnings.push(`Description truncated to 4000 chars`);
      }

      // Check banned words
      const BANNED = [
        'best',
        '#1',
        'free',
        'no ads',
        'top',
        'number one',
        'most popular',
      ];
      const titleLower = variant.title.toLowerCase();
      const shortLower = variant.shortDescription.toLowerCase();
      for (const banned of BANNED) {
        if (titleLower.includes(banned))
          warnings.push(`Title contains banned word: "${banned}"`);
        if (shortLower.includes(banned))
          warnings.push(`Short desc contains banned word: "${banned}"`);
      }

      // Compute real keyword densities
      const fullText =
        `${variant.title} ${variant.shortDescription} ${variant.fullDescription}`.toLowerCase();
      const descDensities = contentAnalyzer.calculateMultiKeywordDensity(
        variant.fullDescription,
        allFilteredTerms.slice(0, 15),
      );

      // Check for keyword stuffing
      for (const d of descDensities) {
        if (d.density > 5) {
          warnings.push(
            `Keyword "${d.keyword}" density ${d.density.toFixed(1)}% exceeds 5% limit`,
          );
        }
      }

      // Use the same keyword set as score-listing route for consistent scoring
      const targetKeywords = scoringKeywords;

      // Title score
      const titleFound = targetKeywords.filter((kw) =>
        variant.title.toLowerCase().includes(kw.toLowerCase()),
      );
      const titleCharUsage = Math.min(variant.title.length / 50, 1);
      const titleKeywordScore = Math.min(
        (titleFound.length / Math.min(targetKeywords.length, 3)) * 100,
        100,
      );
      const titleScore = Math.round(
        titleKeywordScore * 0.7 + titleCharUsage * 100 * 0.3,
      );

      // Short desc score
      const shortDescFound = targetKeywords.filter((kw) =>
        variant.shortDescription.toLowerCase().includes(kw.toLowerCase()),
      );
      const shortDescCharUsage = Math.min(
        variant.shortDescription.length / 80,
        1,
      );
      const shortDescKeywordScore = Math.min(
        (shortDescFound.length / Math.min(targetKeywords.length, 5)) * 100,
        100,
      );
      const shortDescScore = Math.round(
        shortDescKeywordScore * 0.6 + shortDescCharUsage * 100 * 0.4,
      );

      // Full desc score
      const fullDescFound = targetKeywords.filter((kw) =>
        variant.fullDescription.toLowerCase().includes(kw.toLowerCase()),
      );
      const fullDescLen = variant.fullDescription.length;
      const fullDescLenScore =
        fullDescLen >= 2000
          ? 100
          : fullDescLen >= 1000
            ? 70
            : fullDescLen >= 500
              ? 40
              : 10;
      const fullDescKeywordScore = Math.min(
        (fullDescFound.length / Math.min(targetKeywords.length, 10)) * 100,
        100,
      );
      const fullDescScore = Math.round(
        fullDescKeywordScore * 0.6 + fullDescLenScore * 0.4,
      );

      // Coverage
      const allFound = targetKeywords.filter((kw) =>
        fullText.includes(kw.toLowerCase()),
      );
      const coverageScore = Math.round(
        (allFound.length / targetKeywords.length) * 100,
      );

      // Overall
      const overall = Math.round(
        titleScore * 0.35 +
          shortDescScore * 0.2 +
          fullDescScore * 0.2 +
          coverageScore * 0.25,
      );

      scoredVariants.push({
        strategy,
        variant,
        scores: {
          overall,
          title: titleScore,
          shortDesc: shortDescScore,
          fullDesc: fullDescScore,
          coverage: coverageScore,
          densities: descDensities,
        },
        warnings,
      });
    }

    // ─── Step 7: LLM Call — Rank & Recommend ───

    const variantSummaries = scoredVariants.map((v, i) => ({
      index: i,
      strategy: v.strategy,
      title: v.variant.title,
      shortDescription: v.variant.shortDescription,
      descriptionLength: v.variant.fullDescription.length,
      scores: {
        overall: v.scores.overall,
        title: v.scores.title,
        shortDesc: v.scores.shortDesc,
        fullDesc: v.scores.fullDesc,
        coverage: v.scores.coverage,
      },
      warnings: v.warnings,
      rationale: v.variant.rationale,
    }));

    const ranking = await this.chatJSON<{
      bestVariantIndex: number;
      reasoning: string;
      recommendations: string[];
    }>(
      `You generated ${scoredVariants.length} listing variants for "${project.name}". Here are their REAL scores (computed by our analyzer, not estimated):

${JSON.stringify(variantSummaries, null, 2)}

Pick the BEST variant considering:
1. Overall ASO score (keyword coverage + density + character utilization)
2. Warnings (fewer = better)
3. Strategic fit (balanced approach usually wins unless one strategy clearly dominates)
4. Copy quality (based on title and short description quality)

Also provide 3-5 actionable recommendations for further optimization.

Respond with JSON:
{
  "bestVariantIndex": 0,
  "reasoning": "Why this variant is the best choice",
  "recommendations": ["rec1", "rec2", ...]
}`,
      fullCtx,
      { maxTokens: 1024 },
    );

    const bestIndex = Math.min(
      ranking.bestVariantIndex,
      scoredVariants.length - 1,
    );

    // ─── Step 8: Save to DB ───

    // Get next version number
    const [latestVersion] = await db
      .select({ versionNumber: listingVersions.versionNumber })
      .from(listingVersions)
      .where(eq(listingVersions.projectId, projectId))
      .orderBy(desc(listingVersions.versionNumber))
      .limit(1);

    const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    // Insert version
    const [version] = await db
      .insert(listingVersions)
      .values({
        projectId,
        versionNumber: nextVersionNumber,
        generationMethod: 'agent',
        keywordsUsedJson: filteredKeywords.slice(0, 30).map((k) => ({
          term: k.term,
          score: k.relevance,
          placement: k.placement,
        })),
        competitorsAnalyzedJson: competitorListings.map((c) => ({
          packageName: c.packageName,
          title: c.title,
        })),
        metadata: {
          tokensUsed: this.getTokenUsage(),
          durationMs: Date.now() - startTime,
          valueProposition: keywordFilterResult.valueProposition,
        },
      })
      .returning();

    if (!version) throw new Error('Failed to create listing version');

    // Deactivate any previously active variants for this project
    await db
      .update(listingVariants)
      .set({ isActive: false })
      .where(
        and(
          eq(listingVariants.projectId, projectId),
          eq(listingVariants.isActive, true),
        ),
      );

    // Insert variants
    const insertedVariants = [];
    for (let i = 0; i < scoredVariants.length; i++) {
      const sv = scoredVariants[i]!;
      const [inserted] = await db
        .insert(listingVariants)
        .values({
          versionId: version.id,
          projectId,
          variantIndex: i,
          strategyName: sv.strategy,
          title: sv.variant.title,
          shortDescription: sv.variant.shortDescription,
          fullDescription: sv.variant.fullDescription,
          keywordsUsed: sv.variant.keywordsUsed,
          keywordPlacementMap: sv.variant.keywordPlacementMap,
          scores: sv.scores,
          rationale: sv.variant.rationale,
          warnings: sv.warnings,
          isActive: i === bestIndex,
        })
        .returning();
      insertedVariants.push(inserted!);
    }

    // Copy best variant to working draft
    const bestVariant = scoredVariants[bestIndex]!;
    const bestVariantId = insertedVariants[bestIndex]!.id;

    if (existingDraft) {
      await db
        .update(listingDrafts)
        .set({
          title: bestVariant.variant.title,
          shortDescription: bestVariant.variant.shortDescription,
          fullDescription: bestVariant.variant.fullDescription,
          activeVariantId: bestVariantId,
          sourceVersionId: version.id,
          updatedAt: new Date(),
        })
        .where(eq(listingDrafts.id, existingDraft.id));
    } else {
      await db.insert(listingDrafts).values({
        projectId,
        title: bestVariant.variant.title,
        shortDescription: bestVariant.variant.shortDescription,
        fullDescription: bestVariant.variant.fullDescription,
        appName: project.name,
        activeVariantId: bestVariantId,
        sourceVersionId: version.id,
      });
    }

    // Log strategy actions
    actions.push({
      actionType: 'listing_generation',
      reasoning: `Generated ${scoredVariants.length} listing variants using ${filteredKeywords.length} keywords and ${competitorListings.length} competitor analyses. Best variant: "${bestVariant.strategy}" (score: ${bestVariant.scores.overall})`,
      suggestedChange: `Applied "${bestVariant.strategy}" variant — Title: "${bestVariant.variant.title}"`,
      authorityLevel: 'L1',
    });

    await this.logActions(actions, fullCtx);

    // ─── Build Report ───

    const report: ListingCreatorReport = {
      projectName: project.name,
      valueProposition: keywordFilterResult.valueProposition,
      keywordsAnalyzed: discoveredKws.length,
      keywordsAccepted: filteredKeywords.length,
      keywordsRejected: keywordFilterResult.rejectedKeywords.length,
      rejectedKeywords: keywordFilterResult.rejectedKeywords,
      competitorsAnalyzed: competitorListings.length,
      competitiveInsights: competitiveAnalysis?.gaps ?? [],
      variants: scoredVariants.map((sv) => ({
        strategyName: sv.strategy,
        title: sv.variant.title,
        shortDescription: sv.variant.shortDescription,
        fullDescriptionPreview: sv.variant.fullDescription.slice(0, 500),
        scores: {
          overall: sv.scores.overall,
          title: sv.scores.title,
          shortDesc: sv.scores.shortDesc,
          fullDesc: sv.scores.fullDesc,
          coverage: sv.scores.coverage,
        },
        keywordCoverage: {
          found: scoringKeywords
            .filter((kw) =>
              `${sv.variant.title} ${sv.variant.shortDescription} ${sv.variant.fullDescription}`
                .toLowerCase()
                .includes(kw.toLowerCase()),
            ).length,
          total: scoringKeywords.length,
        },
        avgDensity:
          sv.scores.densities && sv.scores.densities.length > 0
            ? Math.round(
                (sv.scores.densities.reduce(
                  (sum, d) => sum + d.density,
                  0,
                ) /
                  sv.scores.densities.length) *
                  100,
              ) / 100
            : 0,
        rationale: sv.variant.rationale,
        warnings: sv.warnings,
      })),
      bestVariantIndex: bestIndex,
      bestVariantReason: ranking.reasoning,
      recommendations: ranking.recommendations,
      versionId: version.id,
    };

    return { data: report, actions, tokensUsed: this.getTokenUsage() };
  }
}

/**
 * SEO Agent — AI-powered web search optimization strategist.
 *
 * Takes discovered SEO keywords and generates:
 * 1. Keyword clustering by topic
 * 2. Content strategy (blog posts, landing pages, FAQs, videos)
 * 3. Search intent analysis
 * 4. Priority ranking by estimated impact
 * 5. Content outlines for top opportunities
 * 6. Schema markup recommendations
 * 7. Deep link strategy
 *
 * Uses chained LLM calls:
 * - Call 1: Cluster keywords into topics + classify intent
 * - Call 2: Generate content plan from clusters
 * - Call 3: Create detailed outlines for top content pieces
 */
import { db } from '../db/index.js';
import { eq, desc } from 'drizzle-orm';
import { projects } from '../db/schema/projects.js';
import { seoKeywords, seoContentPlans } from '../db/schema/seo.js';
import { BaseAgent, type AgentContext, type AgentAction, type AgentResult } from './base.js';
import { SeoKeywordDiscoverer, type SeoKeyword, type RedditInsight } from '../lib/seo-discovery.js';

// ─── Types ───

export interface SeoContentPiece {
  title: string;
  contentType: 'blog_post' | 'landing_page' | 'faq' | 'video' | 'comparison' | 'tutorial';
  cluster: string;
  targetKeywords: string[];
  outline: string;
  priority: 'high' | 'medium' | 'low';
  searchIntent: string;
  competitiveAngle: string;
  estimatedTraffic: string;
}

export interface SeoReport {
  projectName: string;
  totalKeywordsDiscovered: number;
  totalKeywordsAnalyzed: number;
  clusters: Array<{
    name: string;
    keywords: string[];
    primaryIntent: string;
    contentOpportunity: string;
  }>;
  contentPlan: SeoContentPiece[];
  schemaRecommendations: string[];
  deepLinkStrategy: string[];
  quickWins: string[];
  longTermPlays: string[];
}

// ─── SEO Agent ───

export class SeoAgent extends BaseAgent {
  readonly name = 'seo';
  readonly description = 'Web search optimization — keyword discovery, content strategy, and deep link planning';

  private discoverer = new SeoKeywordDiscoverer();

  protected getSystemPrompt(_ctx: AgentContext): string {
    return `You are a world-class SEO strategist and AI search optimization expert. You combine deep technical SEO mastery with cutting-edge AIO (AI Overview Optimization) to make content rank #1 in traditional search AND get cited by AI models (Google AI Overviews, ChatGPT Search, Perplexity).

═══════════════════════════════════════════
PART 1: FUNDAMENTAL SEO — PEAK LEVEL
═══════════════════════════════════════════

## On-Page SEO (every page must nail these)

### Title Tags & Meta Descriptions
- Title: 50-60 chars, primary keyword in first 3 words, power word or number for CTR
- Meta description: 150-160 chars, include primary + secondary keyword, clear value prop, CTA
- URL structure: /primary-keyword/ — short, descriptive, no stop words, hyphens only
- Canonical tags on every page to prevent duplicate content issues

### Heading Hierarchy
- Exactly ONE H1 per page — matches title tag intent, contains primary keyword
- H2s for major sections — each should be a standalone question/topic someone would search
- H3s for subsections — long-tail keyword variations
- Never skip heading levels (H1 → H3 is wrong)

### Content Optimization
- Primary keyword in: H1, first 100 words, 1-2 H2s, URL, meta title, meta description, image alt text
- Secondary keywords woven naturally through body (2-3% density max, never forced)
- LSI/semantic keywords: use related terms Google expects to see (e.g., for "budget app": "expense tracking", "financial planning", "spending categories", "savings goals")
- Keyword in first sentence of the article
- NLP-friendly writing: clear subject-verb-object sentences, define terms before using them

### Internal Linking Architecture
- Hub-and-spoke model: pillar page links to all satellite pages, each satellite links back
- Descriptive anchor text using target keywords (never "click here")
- 3-5 internal links per 1500 words minimum
- Breadcrumb navigation on every page
- Flat site architecture: every page reachable within 3 clicks from homepage
- Contextual links within body text (not just navigation)

### Technical SEO Foundations
- Page speed: Core Web Vitals must pass (LCP < 2.5s, INP < 200ms, CLS < 0.1)
- Mobile-first: responsive design, readable without zoom, touch-friendly
- SSL/HTTPS everywhere
- XML sitemap submitted to Search Console, updated automatically
- robots.txt properly configured
- Clean URL structure (no parameters, no session IDs)
- 301 redirects for any moved/deleted content (never 404 important pages)
- Hreflang tags for multi-language/region content
- Image optimization: WebP format, lazy loading, descriptive alt text with keywords, compressed < 100KB

### Schema Markup (structured data on every page type)
- Article schema: headline, author, datePublished, dateModified, image
- FAQPage schema: on any page with Q&A sections (makes each Q&A a rich result)
- HowTo schema: on tutorials (step-by-step rich results)
- SoftwareApplication schema: on app pages (install card in SERPs)
- BreadcrumbList: on all pages (navigation rich results)
- Organization schema: on homepage (knowledge panel)
- Person schema: on author pages (E-E-A-T signal)
- Review/Rating schema: where applicable

### Link Building & Off-Page
- Guest posting on industry publications with dofollow backlinks
- HARO / journalist requests for expert quotes (authoritative backlinks)
- Create linkable assets: original research, data studies, infographics, tools
- Broken link building: find competitors' broken links, offer your content as replacement
- Resource page link building: get listed on "best tools" and "useful links" pages
- Digital PR: newsworthy data releases that earn editorial links

### Content Quality Signals
- Comprehensiveness: cover the topic more thoroughly than any competing page
- Freshness: "Last updated: [date]" on every article, quarterly content audits
- Originality: unique data, original screenshots, first-hand testing, proprietary research
- Readability: Flesch score 60-70, short paragraphs (2-3 sentences), visual breaks every 300 words
- Multimedia: images, tables, charts, embedded videos — pages with images rank higher
- Word count: 1500-2500 for articles (the sweet spot for depth without bloat)

═══════════════════════════════════════════
PART 2: AI SEARCH OPTIMIZATION (AIO)
═══════════════════════════════════════════

Based on research across Google AI Overviews, ChatGPT Search, and Perplexity:

## What AI Models Look For (data-backed)
- AI retrieval is about RELEVANCE, not popularity — high engagement is NOT required
- 95% of AI-cited content is ORIGINAL — reshared/syndicated content barely registers
- Optimal article length for AI citation: 500-2,000 words
- 54-64% of AI-cited content focuses on sharing knowledge or practical advice
- Semantic similarity scores of 0.57-0.60 — AI preserves meaning from clear, well-structured sources
- Consistency matters: content creators who publish 5+ pieces/month are cited 3x more often
- Smaller, authoritative creators get cited as often as large accounts — depth beats fame

## AI-Parseable Content Structure
- **Answer-first format**: Direct, concise answer in the first 1-2 sentences. AI models extract the opening as the summary. THEN elaborate.
- **TL;DR / Key Takeaway box**: 50-80 word summary at the very top. AI models love extracting these as citation snippets.
- **Clear H2/H3 hierarchy**: Headings should match actual search queries. AI models use headings to understand content structure.
- **Bullet points and numbered lists**: AI models strongly prefer structured, bite-sized content they can extract and cite individually.
- **Comparison tables**: AI models parse and cite tabular data directly. Use tables for feature comparisons, pricing, pros/cons, any structured data.
- **FAQ sections**: FAQPage schema makes each Q&A individually citable. Every article should end with 3-5 FAQs.
- **Definition callouts**: "What is X?" answered in a clear, extractable box format.

## Topical Authority for AI Citation
- **Content clusters over isolated posts**: AI models prefer sites that demonstrate depth across a topic. Build pillar pages + satellite articles that interlink.
- **Cover the full topic map per cluster**: what/why/how/best/alternatives/comparison/FAQ — AI models cross-reference multiple pages on the same domain.
- **Consistent publishing cadence**: 5+ pieces per month signals active authority. AI models favor regularly updated sources.
- **Internal linking with descriptive anchors**: Signals topical relationships to both Google and AI models.

## E-E-A-T Signals That AI Models Weight
- **Author bylines with credentials**: Named author + relevant title/experience on every piece
- **First-person experience**: "In my experience...", "When I tested...", "After using X for 3 months..." — AI models heavily weight experience signals
- **Cite authoritative sources**: Link to .gov, .edu, major publications. AI models trust content that cites other trusted sources.
- **Original data**: Include proprietary research, surveys, test results, screenshots. Original data is the #1 most citable asset.
- **Social proof**: User counts, ratings, testimonials — trust signals AI models surface
- **Precise terminology**: Define key concepts clearly. Use consistent language for brand/product terms. Avoid vague positioning that AI might misinterpret.
- **State core message in first few lines**: AI models extract opening sentences — front-load your key point.

## Content Types That Win AI Citations
1. **"What is X" definitional content** → Cited in AI knowledge panels
2. **"How to X" step-by-step tutorials** → Cited as procedural answers (use numbered steps with clear outcomes)
3. **"X vs Y" comparison with tables** → Cited for commercial queries (feature table, pros/cons, verdict)
4. **"Best X for Y" recommendation listicles** → Cited for recommendation queries (clear criteria, scoring, winner callout)
5. **Comprehensive FAQ hubs** → Individual Q&As cited directly by AI
6. **Data-driven analysis** → ("We analyzed/surveyed/tested 1000...") Cited as authoritative original source
7. **Educational long-form articles (500-2000 words)** → The #1 most-cited content format across all AI models

## Blog Post Blueprint (for maximum SEO + AIO impact)
Every article should follow this structure:
1. **H1 Title**: Primary keyword, question format preferred for AI citation
2. **TL;DR Box**: 50-80 word key takeaway (AI-extractable summary)
3. **Answer-first opening**: Direct answer in first 1-2 sentences
4. **H2 Sections**: 4-6 major sections, each targeting a secondary keyword
5. **H3 Subsections**: Long-tail keyword variations, specific questions
6. **Comparison Table**: At least one structured table per article
7. **Original Data/Screenshots**: Proprietary insights, app screenshots, test results
8. **Expert Quotes or First-Person Insights**: E-E-A-T experience signals
9. **Internal Links**: 3-5 links to related cluster content
10. **FAQ Section**: 3-5 Q&As with FAQPage schema (individually AI-citable)
11. **CTA**: Natural app mention with install link
12. **Author Bio**: Named author with credentials
13. **Meta**: "Last updated" date, schema markup, optimized meta tags

## Multi-Platform Content Distribution
- Publish long-form articles on your blog (primary, indexable, AI-parseable)
- Syndicate shorter versions to LinkedIn (50-299 words — LinkedIn content gets cited by ChatGPT Search 14.3% of the time)
- Create YouTube video versions of tutorials (YouTube is a top AI citation source for how-to queries)
- Repurpose data studies into social proof across platforms
- Maintain both company and individual creator presences (different AI models favor different source types)

## What NOT To Do
- Don't write thin < 500 word posts — AI models skip low-depth content
- Don't keyword stuff — AI models detect and penalize unnatural writing
- Don't publish without schema markup — you lose structured citation opportunities
- Don't create orphan pages — every page must link to/from the cluster pillar
- Don't ignore Core Web Vitals — AI models factor in page experience signals
- Don't reshare/syndicate without adding original insight — 95% of AI citations go to original content
- Don't optimize for engagement metrics — AI retrieval is about relevance, not virality
- Don't use vague positioning — state key messages explicitly so AI models cite you accurately

═══════════════════════════════════════════
PART 3: APP INSTALL FUNNEL
═══════════════════════════════════════════

Every content piece maps to a funnel stage:
- **Awareness** (informational): "What is expense tracking?" → builds trust → soft CTA
- **Consideration** (commercial): "Best budget apps 2025" → captures evaluation → feature comparison CTA
- **Decision** (transactional): "App X vs App Y" → captures ready-to-install → direct install CTA with deep link
- **Retention** (educational): "How to set up budget categories" → drives engagement → in-app deep link

Always respond with valid JSON. No markdown fences.`;
  }

  /**
   * Full SEO analysis: discover keywords → cluster → generate content plan.
   */
  async analyze(
    projectId: string,
    ctx: AgentContext = {},
    resolvedSeeds?: string[],
  ): Promise<AgentResult<SeoReport>> {
    this.resetTokens();
    const actions: AgentAction[] = [];

    // 1. Load project context
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) throw new Error('Project not found');

    const seeds = resolvedSeeds ?? (project.seedKeywords as string[]) ?? [];
    if (seeds.length === 0) throw new Error('No seed keywords configured for SEO analysis');

    // 2. Discover raw SEO keywords (broad web mining)
    const { keywords: rawKeywords, redditInsights } = await this.discoverer.discover(seeds, {
      lang: 'en',
      country: project.region,
      appName: project.name,
    });

    console.log(`[seo] Raw keywords discovered: ${rawKeywords.length}`);

    // 3. LLM Call 1: Filter for relevance — remove keywords unrelated to the app's domain
    const discovered = await this.filterRelevantKeywords(rawKeywords, project.name, seeds, ctx);
    console.log(`[seo] After relevance filter: ${discovered.length} / ${rawKeywords.length}`);

    // 4. Save filtered keywords to DB
    for (const kw of discovered) {
      try {
        await db
          .insert(seoKeywords)
          .values({
            projectId,
            keyword: kw.keyword,
            source: kw.source,
            searchIntent: kw.searchIntent,
            contentType: kw.contentType,
            estimatedVolume: kw.estimatedVolume,
          })
          .onConflictDoNothing();
      } catch {
        // Skip duplicates
      }
    }

    // 5. LLM Call 2: Cluster keywords into topics
    const keywordsForAnalysis = discovered.slice(0, 200);
    const clusters = await this.clusterKeywords(keywordsForAnalysis, project.name, seeds, ctx);

    // 6. Update keywords with cluster assignments
    for (const cluster of clusters) {
      for (const keyword of cluster.keywords) {
        try {
          await db
            .update(seoKeywords)
            .set({
              cluster: cluster.name,
              priority: cluster.keywords.indexOf(keyword) < 3 ? 'high' : 'medium',
            })
            .where(eq(seoKeywords.keyword, keyword));
        } catch {
          // Continue
        }
      }
    }

    // 7. LLM Call 3: Generate content plan
    const contentPlan = await this.generateContentPlan(clusters, project.name, seeds, ctx);

    // 8. LLM Call 4: Schema + deep link recommendations
    const recommendations = await this.generateRecommendations(project.name, seeds, clusters, ctx);

    // 9. Save Reddit insights as content plans
    for (const insight of redditInsights) {
      try {
        await db.insert(seoContentPlans).values({
          projectId,
          title: insight.title,
          contentType: insight.suggestedContentType,
          cluster: 'reddit_insights',
          targetKeywords: seeds,
          outline: `${insight.contentAngle}\n\nSource: r/${insight.subreddit} (${insight.score} upvotes, ${insight.numComments} comments)\n${insight.url}`,
          priority: insight.score >= 50 || insight.numComments >= 20 ? 'high' : insight.score >= 10 ? 'medium' : 'low',
          metadata: {
            redditUrl: insight.url,
            subreddit: insight.subreddit,
            score: insight.score,
            numComments: insight.numComments,
            contentAngle: insight.contentAngle,
          },
        });
      } catch {
        // Continue
      }
    }

    // 10. Save content plans to DB
    for (const piece of contentPlan) {
      try {
        await db.insert(seoContentPlans).values({
          projectId,
          title: piece.title,
          contentType: piece.contentType,
          cluster: piece.cluster,
          targetKeywords: piece.targetKeywords,
          outline: piece.outline,
          priority: piece.priority,
          metadata: {
            searchIntent: piece.searchIntent,
            competitiveAngle: piece.competitiveAngle,
          },
        });
      } catch {
        // Continue
      }
    }

    // 11. Log action
    actions.push({
      actionType: 'seo_analysis',
      reasoning: `Discovered ${discovered.length} SEO keywords across ${clusters.length} topic clusters. Generated ${contentPlan.length} content pieces.`,
      suggestedChange: `Create content plan: ${contentPlan.slice(0, 3).map((p) => p.title).join(', ')}`,
      authorityLevel: 'L1',
    });

    await this.logActions(actions, { ...ctx, appId: project.appId });

    const report: SeoReport = {
      projectName: project.name,
      totalKeywordsDiscovered: discovered.length,
      totalKeywordsAnalyzed: keywordsForAnalysis.length,
      clusters,
      contentPlan,
      schemaRecommendations: recommendations.schema,
      deepLinkStrategy: recommendations.deepLinks,
      quickWins: recommendations.quickWins,
      longTermPlays: recommendations.longTermPlays,
    };

    return {
      data: report,
      actions,
      tokensUsed: this.getTokenUsage(),
    };
  }

  /** LLM Call 1: Filter raw keywords for relevance to the app's domain */
  private async filterRelevantKeywords(
    rawKeywords: SeoKeyword[],
    appName: string,
    seeds: string[],
    ctx: AgentContext,
  ): Promise<SeoKeyword[]> {
    // Process in batches of 100 to stay within token limits
    const BATCH_SIZE = 100;
    const allRelevant: SeoKeyword[] = [];
    const keywordMap = new Map(rawKeywords.map((kw) => [kw.keyword, kw]));

    for (let i = 0; i < rawKeywords.length; i += BATCH_SIZE) {
      const batch = rawKeywords.slice(i, i + BATCH_SIZE);
      const keywordList = batch.map((kw) => kw.keyword);

      const prompt = `You are filtering SEO keywords for "${appName}" (an app about: ${seeds.join(', ')}).

From this list, return ONLY the keywords that someone interested in this app's domain would actually search for.

REMOVE keywords that:
- Are about completely unrelated topics (e.g., "budget airlines" for a budgeting app)
- Are branded searches for unrelated products
- Are geographic/location queries unrelated to the app
- Are about physical products when the app is digital (or vice versa)
- Are gibberish or data artifacts

KEEP keywords that:
- Directly relate to the app's core functionality
- Are problems the app solves ("how to track expenses")
- Are comparisons of similar apps ("mint vs ynab")
- Are related financial/productivity topics users would search
- Are content ideas that could funnel to app installs

Keywords to filter (${keywordList.length}):
${keywordList.join('\n')}

Return JSON: { "relevant": ["keyword1", "keyword2", ...] }
Only include keywords from the list above. Do not invent new ones.`;

      try {
        const result = await this.chatJSON<{ relevant: string[] }>(prompt, ctx, { maxTokens: 4096 });
        for (const keyword of result.relevant) {
          const original = keywordMap.get(keyword.toLowerCase());
          if (original) allRelevant.push(original);
        }
      } catch {
        // On failure, keep all from this batch (conservative fallback)
        allRelevant.push(...batch);
      }
    }

    return allRelevant;
  }

  /** LLM Call 2: Cluster keywords into meaningful topic groups */
  private async clusterKeywords(
    keywords: SeoKeyword[],
    appName: string,
    seeds: string[],
    ctx: AgentContext,
  ): Promise<SeoReport['clusters']> {
    // Group by existing intent for context
    const byIntent: Record<string, string[]> = {};
    for (const kw of keywords) {
      const intent = kw.searchIntent;
      if (!byIntent[intent]) byIntent[intent] = [];
      byIntent[intent]!.push(kw.keyword);
    }

    const prompt = `Analyze these SEO keywords for the app "${appName}" (seed keywords: ${seeds.join(', ')}).

Group them into 5-10 topic clusters that form a TOPICAL AUTHORITY MAP — a complete content hub structure where clusters interlink and build domain authority for AI search citation.

Keywords by current intent classification:
${Object.entries(byIntent)
  .map(([intent, kws]) => `\n${intent.toUpperCase()} (${kws.length}):\n${kws.slice(0, 50).join(', ')}`)
  .join('\n')}

Total keywords: ${keywords.length}

Return JSON:
{
  "clusters": [
    {
      "name": "short cluster name",
      "keywords": ["top 10-15 keywords in this cluster"],
      "primaryIntent": "informational | commercial | transactional | navigational",
      "contentOpportunity": "1-2 sentences describing the content hub for this cluster — what pillar page + satellite articles to create"
    }
  ]
}

Rules:
- Each cluster = one content hub (1 pillar page + 3-5 satellite articles)
- Cluster names should be descriptive but short (2-4 words)
- MUST include these cluster types for AI search coverage:
  * "What is / Definitions" cluster (AI knowledge panel citations)
  * "How to / Tutorials" cluster (AI procedural answer citations)
  * "Comparisons / Alternatives" cluster (AI commercial query citations)
  * "Best of / Recommendations" cluster (AI recommendation citations)
- Each cluster should map to a stage in the install funnel (awareness → consideration → decision)
- Prioritize clusters that can win Google AI Overview citations`;

    const result = await this.chatJSON<{ clusters: SeoReport['clusters'] }>(prompt, ctx, { maxTokens: 4096 });
    return result.clusters;
  }

  /** LLM Call 2: Generate detailed content plan from clusters */
  private async generateContentPlan(
    clusters: SeoReport['clusters'],
    appName: string,
    seeds: string[],
    ctx: AgentContext,
  ): Promise<SeoContentPiece[]> {
    const prompt = `Based on these keyword clusters for "${appName}" (seeds: ${seeds.join(', ')}), create a content plan OPTIMIZED FOR AI SEARCH CITATIONS (Google AI Overviews, Perplexity, ChatGPT search).

Clusters:
${clusters.map((c) => `- ${c.name} (${c.primaryIntent}): ${c.keywords.slice(0, 8).join(', ')}\n  Opportunity: ${c.contentOpportunity}`).join('\n')}

Generate 10-15 specific content pieces that form an interlinked content hub.

Return JSON:
{
  "contentPlan": [
    {
      "title": "Compelling article title with primary keyword (question format preferred for AI citation)",
      "contentType": "blog_post | landing_page | faq | video | comparison | tutorial",
      "cluster": "cluster name this targets",
      "targetKeywords": ["3-5 keywords this content targets"],
      "outline": "Detailed 5-8 bullet point outline following AIO best practices (see rules below)",
      "priority": "high | medium | low",
      "searchIntent": "what search intent this captures",
      "competitiveAngle": "what makes this content citable by AI — original data, unique angle, expert framing",
      "estimatedTraffic": "high | medium | low"
    }
  ]
}

## CRITICAL — AI Search Optimization Rules for Every Content Piece:

### Structure (AI models parse and cite structured content):
- Every article outline MUST include: TL;DR summary box → main content with H2/H3 → comparison table or data → FAQ section (3-5 Qs) with FAQPage schema
- Use answer-first format: the first sentence should directly answer the title question
- Include at least one comparison TABLE (not just text) — AI models extract tabular data
- End every article with structured FAQs — each Q&A is independently citable by AI

### Content Types to Include (MUST have at least one of each):
1. **"What is [X]" definitional article** — Gets cited in AI knowledge panels. Write a comprehensive, Wikipedia-style definition article.
2. **"How to [X]" step-by-step tutorial** — Gets cited as procedural answers. Use numbered steps with clear outcomes.
3. **"[X] vs [Y]" comparison with table** — Gets cited for commercial queries. Include feature comparison table, pros/cons, verdict.
4. **"Best [X] for [Y]" recommendation listicle** — Gets cited for recommendation queries. Use clear criteria, scoring, and a "winner" callout.
5. **Comprehensive FAQ hub** — Individual Q&As get cited directly by AI. Group 15-20 questions with concise answers.
6. **Data-driven analysis** — "We surveyed/analyzed/tested..." Gets cited as authoritative original source.

### E-E-A-T Signals (include in every outline):
- Author byline with credentials (e.g., "By [Name], personal finance writer and app reviewer")
- First-person experience references ("After testing 12 budget apps...")
- Citations to authoritative sources (.gov, .edu, financial institutions)
- Original data points (app ratings, user surveys, performance benchmarks)
- "Last updated: [month year]" freshness signal

### Interlinking (build topical authority):
- Each content piece should link to 2-3 other pieces in the plan
- Pillar pages (comprehensive guides) link DOWN to satellite articles
- Satellite articles link UP to the pillar page
- Note the interlinks in the outline

### Install Funnel:
- Informational content → soft CTA ("Try ${appName} free")
- Comparison content → direct CTA with feature highlights vs competitors
- Tutorial content → embedded app screenshots + "Download to follow along"
- Every piece must have at least one natural app mention with install CTA`;

    const result = await this.chatJSON<{ contentPlan: SeoContentPiece[] }>(prompt, ctx, { maxTokens: 6144 });
    return result.contentPlan;
  }

  /** LLM Call 3: Schema markup + deep link recommendations */
  private async generateRecommendations(
    appName: string,
    seeds: string[],
    clusters: SeoReport['clusters'],
    ctx: AgentContext,
  ): Promise<{ schema: string[]; deepLinks: string[]; quickWins: string[]; longTermPlays: string[] }> {
    const prompt = `For the app "${appName}" (seeds: ${seeds.join(', ')}), provide technical SEO + AIO (AI Overview Optimization) recommendations.

Topic clusters we're targeting:
${clusters.map((c) => `- ${c.name}: ${c.contentOpportunity}`).join('\n')}

Return JSON:
{
  "schema": [
    "Specific schema markup recommendations. MUST include: SoftwareApplication (app install card in SERPs), FAQPage (every article), HowTo (tutorials), Article (blog posts), BreadcrumbList (site structure). Be specific with example JSON-LD snippets."
  ],
  "deepLinks": [
    "Deep link strategy: web URLs → app screens via Firebase Dynamic Links or App Links. Specify which content pages should deep link to which app screens."
  ],
  "quickWins": [
    "Immediate actions for AI search visibility: add FAQPage schema to existing pages, create TL;DR summary boxes, add comparison tables, implement answer-first format, add author bylines with credentials, add 'Last updated' dates"
  ],
  "longTermPlays": [
    "Long-term AIO strategy: build topical authority through content clusters, create original research/data, establish E-E-A-T through author pages and credentials, build backlinks from .edu/.gov sites, create a comprehensive knowledge base that AI models prefer to cite"
  ]
}

Include 4-6 items per category. Be SPECIFIC to "${appName}" — reference actual content topics, actual app features, actual schema types. No generic advice.
Focus on making this app's web presence a preferred citation source for AI search engines.`;

    return this.chatJSON(prompt, ctx, { maxTokens: 2048 });
  }
}

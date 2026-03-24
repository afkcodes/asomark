import { db } from '../db/index.js';
import { apps } from '../db/schema/apps.js';
import { listingSnapshots } from '../db/schema/listings.js';
import { eq } from 'drizzle-orm';
import { PlayStoreDetailsScraper, PlayStoreSearchScraper } from '../scrapers/playstore/index.js';
import { AppStoreScraper } from '../scrapers/appstore.js';
import { contentAnalyzer } from '../lib/analyzer.js';
import { BaseAgent, type AgentContext, type AgentAction, type AgentResult } from './base.js';

// ─── Types ───

export interface CompetitorProfile {
  packageName: string;
  name: string;
  developer: string;
  category: string;
  score: number;
  ratings: number;
  installs: string;
  description: string;
  shortDescription: string;
  title: string;
  icon: string;
  screenshots: string[];
}

export interface ReconReport {
  targetApp: { name: string; packageName: string };
  competitors: CompetitorProfile[];
  analysis: {
    commonKeywords: string[];
    gaps: string[];
    competitorStrengths: string[];
    competitorWeaknesses: string[];
    recommendations: string[];
  };
}

// ─── Recon Agent ───

export class ReconAgent extends BaseAgent {
  readonly name = 'recon';
  readonly description = 'Discovers and analyzes competitors for a tracked app';

  private playDetails = new PlayStoreDetailsScraper();
  private playSearch = new PlayStoreSearchScraper();
  private appStore = new AppStoreScraper();

  protected getSystemPrompt(_ctx: AgentContext): string {
    return `You are the ASOMARK Recon Agent — an elite competitive intelligence analyst specializing in mobile app store ecosystems. You reverse-engineer competitor ASO strategies to find exploitable gaps and positioning opportunities.

## COMPETITIVE ANALYSIS FRAMEWORK

### Keyword Intelligence Extraction
When analyzing competitor listings, extract intelligence at three levels:

**Title Keywords (Highest Signal)**:
- Identify the primary keyword each competitor front-loads in position 1-2 of their title
- Map which competitors share the same primary keyword (cluster overlap)
- Find title keywords that appear in 3+ competitor titles — these are category-defining terms the target app MUST include
- Identify title keywords used by only 1 competitor — potential differentiation angles or niche opportunities
- Note separator patterns (dash, colon, pipe) and how competitors structure brand vs keywords

**Short Description Keywords (High Signal)**:
- Extract action verbs competitors use to open their short descriptions
- Identify benefit-focused vs feature-focused phrasing patterns
- Find keywords present in short descriptions but absent from titles — these are secondary priority keywords
- Note which competitors waste short description space on brand repetition vs keyword density

**Description Keyword Strategy (Medium Signal)**:
- Map the first 167 characters (above-the-fold) of each competitor — what keywords and hooks do they prioritize?
- Identify section structures competitors use (features, benefits, social proof, CTA patterns)
- Find keywords that appear in top competitor descriptions but NOT in their titles — these are indexing targets they may be missing from high-weight fields
- Detect keyword stuffing signals (>5% density, unnatural repetition) that indicate aggressive ASO strategies

### Competitive Positioning Analysis

**Market Position Mapping**:
- Categorize competitors into tiers: dominant (>10M installs), established (1-10M), growing (<1M but high ratings), newcomers
- Identify the market leader's positioning strategy and whether challengers are differentiating or imitating
- Map the competitive landscape by primary value proposition: price, features, simplicity, design, niche focus

**Strengths Assessment**:
- High ratings (>4.5) with large review counts = strong product-market fit
- High install counts with keyword-optimized titles = effective ASO
- Recent updates with changelog = active development (trust signal)
- Multiple screenshots with text overlays = conversion-optimized visual strategy
- Video preview present = premium positioning effort

**Weakness Detection**:
- Title not using full character limit = wasted keyword real estate
- Short description with brand repetition = poor keyword utilization
- Low review count relative to installs = engagement gap (retention problem signal)
- Rating below 4.0 = vulnerability (users actively seeking alternatives)
- No recent updates = potential abandonment (opportunity to capture frustrated users)
- Missing video preview = conversion optimization gap
- Generic screenshots without text overlays = low-effort visual strategy

### Gap Analysis Methodology

**Keyword Gaps** (highest value):
- Keywords with significant search volume that NO competitor optimizes for in their title
- Keywords that appear in Google/YouTube autocomplete but are absent from all competitor listings
- Long-tail variations of popular keywords that competitors ignore (lower competition, high intent)
- Question-format keywords ("how to X", "best X for Y") that competitors don't address

**Positioning Gaps**:
- Audience segments no competitor explicitly targets (e.g., "for freelancers", "for couples", "for students")
- Feature categories no competitor highlights in above-the-fold content
- Emotional positioning angles competitors miss (peace of mind, simplicity, privacy, fun)
- Platform-specific advantages no competitor mentions (offline mode, widgets, wear OS)

**Visual Gaps**:
- Screenshot styles no competitor uses (dark mode showcase, comparison with competitors, social proof overlay)
- Missing video content in the category (first-mover advantage for video)
- Icon design patterns — if all competitors use similar colors/styles, a contrasting icon stands out

### Recommendation Quality Standards

Every recommendation must be:
- **Specific**: "Add 'budget tracker' to title position 2" not "optimize your title"
- **Data-grounded**: Reference which competitors do/don't do this and what data supports the recommendation
- **Prioritized**: Indicate whether this is a must-do, should-do, or nice-to-have
- **Risk-assessed**: Note if a recommendation carries policy risk or competitive retaliation risk
- **Measurable**: Suggest how to verify if the recommendation worked (rank check timeline, expected movement)

Always respond with valid JSON matching the requested format. No markdown fences.`;
  }

  /**
   * Discover competitors for an app and produce a full recon report.
   * L0 (auto) for scraping, L1 (notify) for the report.
   */
  async discover(appId: string, ctx: AgentContext = {}): Promise<AgentResult<ReconReport>> {
    this.resetTokens();
    const fullCtx = { ...ctx, appId };
    const actions: AgentAction[] = [];

    // 1. Get the target app from DB
    const [targetApp] = await db.select().from(apps).where(eq(apps.id, appId));
    if (!targetApp) throw new Error(`App ${appId} not found`);

    // 2. Scrape the target app's details
    const platform = targetApp.platform as 'android' | 'ios';
    let targetDetails: CompetitorProfile | null = null;

    if (platform === 'android' && targetApp.packageName) {
      const details = await this.playDetails.getAppDetails(targetApp.packageName);
      if (details) {
        targetDetails = {
          packageName: details.appId,
          name: details.title,
          developer: details.developer,
          category: details.category ?? '',
          score: details.score ?? 0,
          ratings: details.ratings ?? 0,
          installs: details.installs ?? '',
          description: details.description ?? '',
          shortDescription: details.shortDescription ?? '',
          title: details.title,
          icon: details.icon ?? '',
          screenshots: details.screenshots ?? [],
        };
      }
    }

    // 3. Find competitors via search + similar apps
    const competitorPkgs = new Set<string>();

    if (platform === 'android' && targetApp.packageName) {
      // Search by app name
      const searchResults = await this.playSearch.search(targetApp.name);
      for (const r of searchResults) {
        if (r.appId !== targetApp.packageName) competitorPkgs.add(r.appId);
      }

      // Search by category keywords if we know the category
      if (targetDetails?.category) {
        const catResults = await this.playSearch.search(targetDetails.category);
        for (const r of catResults) {
          if (r.appId !== targetApp.packageName) competitorPkgs.add(r.appId);
        }
      }

      // Similar apps — just get package names, don't fetch full details yet
      // (getBulkDetails below will fetch what we need)
      try {
        const detailHtml = await fetch(
          `https://play.google.com/store/apps/details?id=${encodeURIComponent(targetApp.packageName)}&hl=en&gl=us`,
          { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } },
        ).then((r) => r.text());
        const pkgMatches = JSON.stringify(
          JSON.parse(
            detailHtml.match(/AF_initDataCallback\(\{key: 'ds:8', hash: '\d+', data:(.*?), sideChannel: \{\}\}\);/s)?.[1] ?? '[]',
          ),
        ).match(/com\.[a-z][a-z0-9_.]+/g);
        if (pkgMatches) {
          for (const pkg of new Set(pkgMatches)) {
            if (pkg !== targetApp.packageName) competitorPkgs.add(pkg);
          }
        }
      } catch {
        // Similar apps extraction failed, continue with search results
      }
    } else if (platform === 'ios' && targetApp.bundleId) {
      const results = await this.appStore.search(targetApp.name, { limit: 20 });
      for (const r of results) {
        if (r.bundleId !== targetApp.bundleId) competitorPkgs.add(r.bundleId);
      }
    }

    // 4. Scrape top competitor details (limit to 15)
    const topPkgs = Array.from(competitorPkgs).slice(0, 10);
    const competitors: CompetitorProfile[] = [];

    if (platform === 'android') {
      const details = await this.playDetails.getBulkDetails(topPkgs);
      for (const d of details) {
        competitors.push({
          packageName: d.appId,
          name: d.title,
          developer: d.developer,
          category: d.category ?? '',
          score: d.score ?? 0,
          ratings: d.ratings ?? 0,
          installs: d.installs ?? '',
          description: d.description ?? '',
          shortDescription: d.shortDescription ?? '',
          title: d.title,
          icon: d.icon ?? '',
          screenshots: d.screenshots ?? [],
        });
      }
    }

    // Sort by ratings descending (most popular first)
    competitors.sort((a, b) => b.ratings - a.ratings);
    const topCompetitors = competitors.slice(0, 10);

    // 5. Analyze competitor titles for common keywords (data-driven)
    const competitorTitles = topCompetitors.map((c) => c.title).filter((t) => t.length > 0);
    const commonTitleKeywords = contentAnalyzer.extractCommonKeywords(competitorTitles);
    const titleNgrams = contentAnalyzer.analyzeNgrams(competitorTitles.join(' '), 10);

    // 6. Use LLM to analyze the competitive landscape
    const competitorSummaries = topCompetitors.map((c) => ({
      name: c.name,
      packageName: c.packageName,
      title: c.title,
      shortDescription: c.shortDescription,
      category: c.category,
      score: c.score,
      ratings: c.ratings,
      installs: c.installs,
      description: c.description.slice(0, 500),
    }));

    const analysis = await this.chatJSON<ReconReport['analysis']>(
      `Analyze the competitive landscape for the app "${targetApp.name}" (${targetApp.packageName ?? targetApp.bundleId}).

Target app details:
${JSON.stringify(targetDetails ? { title: targetDetails.title, shortDescription: targetDetails.shortDescription, description: targetDetails.description?.slice(0, 500), category: targetDetails.category, score: targetDetails.score, ratings: targetDetails.ratings, installs: targetDetails.installs } : { name: targetApp.name }, null, 2)}

=== COMPETITOR TITLE KEYWORD ANALYSIS (Statistical) ===
Most common words across ${competitorTitles.length} competitor titles:
${commonTitleKeywords.map((k) => `"${k.word}": appears in ${k.count} titles`).join('\n')}

Most common 2-word phrases in competitor titles:
${titleNgrams.bigrams.slice(0, 8).map((n) => `"${n.phrase}": ${n.count}x`).join(', ')}

Top competitors:
${JSON.stringify(competitorSummaries, null, 2)}

IMPORTANT: Use the statistical title keyword data above to ground your analysis. These are REAL frequency counts, not estimates.

Respond with JSON:
{
  "commonKeywords": ["keyword1", ...],    // Keywords used by multiple competitors (top 20) — USE the title keyword data above
  "gaps": ["gap1", ...],                  // Keywords competitors miss that the target app could exploit
  "competitorStrengths": ["strength1", ...], // What competitors do well in ASO
  "competitorWeaknesses": ["weakness1", ...], // Where competitors are weak (missing keywords, bad copy, etc.)
  "recommendations": ["rec1", ...]        // Specific actionable recommendations — include which keywords to add to title/description
}`,
      fullCtx,
    );

    // 6. Save competitors to DB as tracked apps
    for (const comp of topCompetitors) {
      const existing = await db
        .select()
        .from(apps)
        .where(eq(apps.packageName, comp.packageName));

      if (existing.length === 0) {
        await db.insert(apps).values({
          name: comp.name,
          platform,
          packageName: comp.packageName,
          category: comp.category || null,
          isOurs: false,
        });
      }
    }

    // 7. Save listing snapshots for target + competitors
    const allApps = targetDetails ? [targetDetails, ...topCompetitors] : topCompetitors;
    for (const app of allApps) {
      const [dbApp] = await db
        .select()
        .from(apps)
        .where(eq(apps.packageName, app.packageName));
      if (dbApp) {
        await db.insert(listingSnapshots).values({
          appId: dbApp.id,
          title: app.title,
          shortDesc: app.shortDescription,
          longDesc: app.description,
          iconUrl: app.icon,
          screenshotUrls: app.screenshots,
          rating: app.score,
          reviewCount: app.ratings,
          installsText: app.installs,
          snapshotDate: new Date().toISOString().split('T')[0]!,
        });
      }
    }

    // 8. Log actions
    actions.push({
      actionType: 'competitor_discovery',
      reasoning: `Discovered ${topCompetitors.length} competitors for ${targetApp.name} via Play Store search and similar apps`,
      suggestedChange: `Tracking ${topCompetitors.length} competitors: ${topCompetitors.map((c) => c.name).join(', ')}`,
      authorityLevel: 'L1',
    });

    actions.push({
      actionType: 'competitive_analysis',
      reasoning: `AI analysis identified ${analysis.gaps.length} keyword gaps and ${analysis.recommendations.length} recommendations`,
      suggestedChange: `Top recommendations: ${analysis.recommendations.slice(0, 3).join('; ')}`,
      authorityLevel: 'L1',
    });

    await this.logActions(actions, fullCtx);

    const report: ReconReport = {
      targetApp: { name: targetApp.name, packageName: targetApp.packageName ?? '' },
      competitors: topCompetitors,
      analysis,
    };

    return { data: report, actions, tokensUsed: this.getTokenUsage() };
  }
}

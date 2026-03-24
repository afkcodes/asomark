import { db } from '../db/index.js';
import { apps } from '../db/schema/apps.js';
import { healthScores } from '../db/schema/health.js';
import { listingSnapshots } from '../db/schema/listings.js';
import { keywords } from '../db/schema/keywords.js';
import { rankSnapshots } from '../db/schema/rankings.js';
import { eq, desc, sql } from 'drizzle-orm';
import { PlayStoreDetailsScraper } from '../scrapers/playstore/index.js';
import { BaseAgent, type AgentContext, type AgentAction, type AgentResult } from './base.js';
import { contentAnalyzer } from '../lib/analyzer.js';

// ─── Types ───

export interface HealthBreakdown {
  titleOptimization: number;       // 0-100
  shortDescOptimization: number;   // 0-100
  descriptionQuality: number;      // 0-100
  keywordCoverage: number;         // 0-100
  visualAssets: number;            // 0-100
  ratingsHealth: number;           // 0-100
  updateRecency: number;           // 0-100
  competitivePosition: number;     // 0-100
}

export interface HealthReport {
  appName: string;
  overallScore: number; // 0-100
  breakdown: HealthBreakdown;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  topIssues: string[];
  quickWins: string[];
}

// Grade thresholds
function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

// ─── Health Scorer ───

export class HealthScorer extends BaseAgent {
  readonly name = 'health';
  readonly description = 'Calculates ASO health score (0-100) with detailed breakdown';

  private playDetails = new PlayStoreDetailsScraper();

  protected getSystemPrompt(_ctx: AgentContext): string {
    return `You are the ASOMARK Health Scorer — a rigorous ASO auditor that evaluates every dimension of an app's store presence against best-in-class benchmarks. Your scores must be grounded in the COMPUTED DATA provided (character utilization, keyword density, N-gram analysis) — never guess when data is available.

## SCORING PHILOSOPHY

Your job is to be HONEST, not encouraging. A mediocre listing should score 40-60, not 70+. High scores (80+) are reserved for listings that genuinely execute ASO best practices. This calibration matters because the health score drives strategic decisions — an inflated score means missed optimization opportunities.

## SCORING RUBRICS (0-100 per dimension)

### titleOptimization
**90-100**: Title uses 45-50 chars (90%+ utilization), front-loads the #1 keyword in position 1-2, includes a second keyword phrase after a separator, no banned words, no wasted characters on generic terms.
**70-89**: Title uses 35-45 chars (70-90%), contains primary keyword but not in position 1, or uses some space on filler words.
**50-69**: Title uses 25-35 chars (50-70%), contains relevant keywords but poor placement, or wastes significant space on brand-only or generic terms.
**30-49**: Title under 25 chars or contains no relevant keywords, or violates character limits.
**0-29**: Title is essentially a brand name only with no keyword optimization, or contains banned words.

Key signals: Use the CHARACTER UTILIZATION data provided. An unused character in the title is objectively wasted ranking potential.

### shortDescOptimization
**90-100**: 75-80 chars used (93%+), opens with action verb keyword, every word is a keyword or conversion trigger, no title keyword repetition, no trailing period.
**70-89**: 60-75 chars used, contains keywords but some wasted words ("the", "and", "your" that aren't part of keyword phrases).
**50-69**: 40-60 chars used, some keyword presence but significant wasted space or title keyword repetition.
**30-49**: Under 40 chars or mostly non-keyword filler text.
**0-29**: Missing, extremely short, or pure brand text with no keywords.

Key signals: Does it repeat title keywords (waste)? Does it start with an action verb? Is every word earning its place?

### descriptionQuality
**90-100**: 2500-4000 chars, keyword density 2-4% for primary keywords (verified from data), structured with sections (features, benefits, social proof, CTA), first 167 chars pack top keywords + compelling hook, Unicode formatting for scannability.
**70-89**: 1500-2500 chars, some keyword presence (1-2% density), decent structure but missing some sections, adequate first 167 chars.
**50-69**: 500-1500 chars, low keyword density (<1%), minimal structure, weak opening.
**30-49**: Under 500 chars or >5% keyword density (stuffing), no structure, no clear value proposition.
**0-29**: Missing, extremely thin, or clearly keyword-stuffed/auto-generated.

Key signals: Use the KEYWORD DENSITY and N-GRAM data provided. Check if title keywords actually appear in the description (they should, 3-5x each). Check first 167 chars quality.

### keywordCoverage
**90-100**: Title keywords all appear in description at 2-4% density, short description adds new keywords not in title, description covers 80%+ of target keyword list.
**70-89**: Most title keywords appear in description, good variety, 60-80% keyword list coverage.
**50-69**: Some keyword overlap between fields, 40-60% coverage of target list.
**30-49**: Poor keyword distribution, significant gaps, many target keywords completely absent.
**0-29**: Keyword strategy is essentially absent — listing reads as if ASO was never considered.

Key signals: Use the computed density data to verify actual keyword presence. Don't trust what the listing "seems" to contain — check the numbers.

### visualAssets
**90-100**: 6-8 screenshots with text overlays and feature callouts, video preview present, high-resolution feature graphic, icon is distinctive and category-appropriate.
**70-89**: 5-6 screenshots, some have text overlays, feature graphic present, decent icon.
**50-69**: 3-4 screenshots, basic/no text overlays, may be missing video or feature graphic.
**30-49**: 1-2 screenshots, no text overlays, missing key visual assets.
**0-29**: No screenshots or extremely low quality.

### ratingsHealth
**90-100**: Rating ≥ 4.5 with 10,000+ reviews, recent reviews are predominantly positive.
**70-89**: Rating 4.0-4.5 with 1,000+ reviews.
**50-69**: Rating 3.5-4.0 or fewer than 1,000 reviews.
**30-49**: Rating 3.0-3.5 or very few reviews (<100).
**0-29**: Rating below 3.0 or essentially no reviews.

### updateRecency
**90-100**: Updated within last 14 days, regular cadence (bi-weekly or more frequent).
**70-89**: Updated within last 30 days.
**50-69**: Updated within last 60 days.
**30-49**: Updated within last 90 days.
**0-29**: Last update more than 90 days ago or unknown.

### competitivePosition
**90-100**: Install count and rating among the top 3 in category, strong keyword positioning.
**70-89**: Solid installs and rating, competitive but not dominant.
**50-69**: Average for category, room for significant improvement.
**30-49**: Below average installs or ratings relative to category.
**0-29**: Significantly behind category leaders on all metrics.

## ISSUE & QUICK WIN STANDARDS

**topIssues** (max 5): Must be specific, quantified problems. Not "title could be better" but "Title uses 28/50 characters (56%) — 22 characters of unused keyword space."

**quickWins** (max 5): Must be actionable changes with estimated impact. Not "improve your title" but "Add 'Budget Planner' after the dash in your title — this keyword has high search volume and you have 15 unused characters."

Prioritize quick wins by: (1) effort required (metadata changes < visual changes < product changes) and (2) expected impact on visibility or conversion.

Always respond with valid JSON. No markdown fences.`;
  }

  /**
   * Calculate comprehensive ASO health score.
   * L0 for data gathering, L1 for the report.
   */
  async score(appId: string, ctx: AgentContext = {}): Promise<AgentResult<HealthReport>> {
    this.resetTokens();
    const fullCtx = { ...ctx, appId };
    const actions: AgentAction[] = [];

    // 1. Get app from DB
    const [targetApp] = await db.select().from(apps).where(eq(apps.id, appId));
    if (!targetApp) throw new Error(`App ${appId} not found`);

    // 2. Get latest listing snapshot
    const [listing] = await db
      .select()
      .from(listingSnapshots)
      .where(eq(listingSnapshots.appId, appId))
      .orderBy(desc(listingSnapshots.snapshotDate))
      .limit(1);

    // 3. Get live data from store
    let liveData: Record<string, unknown> | null = null;
    if (targetApp.packageName) {
      const details = await this.playDetails.getAppDetails(targetApp.packageName);
      if (details) {
        liveData = {
          title: details.title,
          shortDescription: details.shortDescription,
          description: details.description,
          recentChanges: details.recentChanges,
          updatedText: details.updatedText,
          score: details.score,
          ratings: details.ratings,
          installs: details.installs,
          screenshotCount: details.screenshots?.length ?? 0,
          hasVideo: !!details.video,
          icon: !!details.icon,
          category: details.category,
          developer: details.developer,
        };
      }
    }

    // 4. Count tracked keywords and rankings
    const keywordCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(keywords)
      .where(eq(keywords.platform, targetApp.platform));

    const rankCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(rankSnapshots)
      .where(eq(rankSnapshots.appId, appId));

    // 5. Compute density & N-gram data from real listing text
    let densitySection = '';
    let charUtilSection = '';

    const titleMax = targetApp.platform === 'ios' ? 30 : 50;
    const shortDescMax = 80;
    const descMax = 4000;

    if (liveData) {
      const title = (liveData.title as string) ?? '';
      const shortDesc = (liveData.shortDescription as string) ?? '';
      const description = (liveData.description as string) ?? '';

      // Character utilization
      charUtilSection = `
Character Utilization:
- Title: ${title.length}/${titleMax} chars (${Math.round((title.length / titleMax) * 100)}% used)${title.length < titleMax * 0.7 ? ' ⚠️ UNDERUSED' : ''}
- Short description: ${shortDesc.length}/${shortDescMax} chars (${Math.round((shortDesc.length / shortDescMax) * 100)}% used)${shortDesc.length < shortDescMax * 0.7 ? ' ⚠️ UNDERUSED' : ''}
- Description: ${description.length}/${descMax} chars (${Math.round((description.length / descMax) * 100)}% used)${description.length < descMax * 0.5 ? ' ⚠️ UNDERUSED' : ''}`;

      // Keyword density & N-grams from description
      if (description.length > 50) {
        const ngrams = contentAnalyzer.analyzeNgrams(description);
        const titleKeywords = contentAnalyzer.extractKeywords(title);

        // Check if title keywords appear in description
        const titleKwDensities = contentAnalyzer.calculateMultiKeywordDensity(
          description,
          titleKeywords.slice(0, 10),
        );

        densitySection = `
Keyword Density Analysis (computed from actual listing):
- Title keywords in description: ${titleKwDensities.filter((d) => d.count > 0).map((d) => `"${d.keyword}" ${d.count}x (${d.density.toFixed(1)}%)`).join(', ') || 'NONE found'}
- Top bigrams in description: ${ngrams.bigrams.slice(0, 8).map((b) => `"${b.phrase}" (${b.count}x)`).join(', ')}
- Top trigrams in description: ${ngrams.trigrams.slice(0, 5).map((t) => `"${t.phrase}" (${t.count}x)`).join(', ')}
- Total unique words: ${ngrams.unigrams.length}`;
      }
    }

    // 6. LLM scoring
    const result = await this.chatJSON<{
      breakdown: HealthBreakdown;
      topIssues: string[];
      quickWins: string[];
    }>(
      `Score the ASO health of "${targetApp.name}" (${targetApp.platform}).

## Live Store Data:
${JSON.stringify(liveData ?? { note: 'No live data available — score conservatively' }, null, 2)}

## Database Info:
- Keywords tracked: ${keywordCount[0]?.count ?? 0}
- Rank snapshots: ${rankCount[0]?.count ?? 0}
- Has listing snapshot: ${!!listing}
${charUtilSection}
${densitySection}

## Scoring Instructions:
Use the COMPUTED data above (character utilization, keyword density, N-grams) to ground your scores in facts.
- titleOptimization: Contains high-value keywords? Within char limits? Front-loaded? Using all available chars?
- shortDescOptimization: Every word a keyword/CTA? Within 80 chars? Using all available chars?
- descriptionQuality: Keyword density 2-4%? Title keywords repeated in description? Natural reading? Feature sections?
- keywordCoverage: Title keywords appearing in description? Sufficient density without stuffing?
- visualAssets: 4+ screenshots? Video? Feature graphic?
- ratingsHealth: Score ≥4.0? Enough ratings? Trend?
- updateRecency: Updated recently? Regular cadence?
- competitivePosition: Relative strength vs category norms

Respond with JSON:
{
  "breakdown": {
    "titleOptimization": <0-100>,
    "shortDescOptimization": <0-100>,
    "descriptionQuality": <0-100>,
    "keywordCoverage": <0-100>,
    "visualAssets": <0-100>,
    "ratingsHealth": <0-100>,
    "updateRecency": <0-100>,
    "competitivePosition": <0-100>
  },
  "topIssues": ["issue1", ...],
  "quickWins": ["win1", ...]
}`,
      fullCtx,
    );

    // 7. Calculate overall score (equal weight for simplicity)
    const b = result.breakdown;
    const overallScore = Math.round(
      (b.titleOptimization +
        b.shortDescOptimization +
        b.descriptionQuality +
        b.keywordCoverage +
        b.visualAssets +
        b.ratingsHealth +
        b.updateRecency +
        b.competitivePosition) / 8,
    );

    // 8. Save to DB
    await db.insert(healthScores).values({
      appId,
      overallScore,
      breakdownJson: result.breakdown,
      date: new Date().toISOString().split('T')[0]!,
    });

    // 9. Log actions
    actions.push({
      actionType: 'health_score',
      reasoning: `ASO health score: ${overallScore}/100 (${scoreToGrade(overallScore)}). Top issue: ${result.topIssues[0] ?? 'none'}`,
      suggestedChange: `Quick wins: ${result.quickWins.slice(0, 3).join('; ')}`,
      authorityLevel: 'L1',
    });

    await this.logActions(actions, fullCtx);

    const report: HealthReport = {
      appName: targetApp.name,
      overallScore,
      breakdown: result.breakdown,
      grade: scoreToGrade(overallScore),
      topIssues: result.topIssues,
      quickWins: result.quickWins,
    };

    return { data: report, actions, tokensUsed: this.getTokenUsage() };
  }
}

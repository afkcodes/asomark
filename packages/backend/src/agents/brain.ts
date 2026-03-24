import { db } from '../db/index.js';
import { apps } from '../db/schema/apps.js';
import { strategyLog } from '../db/schema/strategy.js';
import { eq, and, desc } from 'drizzle-orm';
import { BaseAgent, type AgentContext, type AgentAction, type AgentResult } from './base.js';
import { ReconAgent, type ReconReport } from './recon.js';
import { KeywordAgent, type KeywordReport } from './keyword.js';
import { ReviewAgent, type ReviewAnalysis } from './review.js';
import { CreativeAgent, type CreativeReport } from './creative.js';
import { HealthScorer, type HealthReport } from './health.js';
import { CorrelationEngine, type CorrelationReport } from './correlation.js';
import { RiskAgent, type RiskReport } from './risk.js';
import { TrackerAgent } from './tracker.js';
import { ExperimentAgent } from './experiment.js';
import { CannibalizationDetector, type CannibalizationReport } from './cannibalization.js';
import { ListingCreatorAgent } from './listing-creator.js';
import { SeoAgent } from './seo.js';

// ─── Types ───

export interface FullAnalysis {
  recon: ReconReport | null;
  keywords: KeywordReport | null;
  reviews: ReviewAnalysis | null;
  creative: CreativeReport | null;
  health: HealthReport | null;
  correlation: CorrelationReport | null;
  risk: RiskReport | null;
  cannibalization: CannibalizationReport | null;
  summary: string;
  nextSteps: string[];
}

export type AgentName = 'recon' | 'keyword' | 'review' | 'creative' | 'health' | 'correlation' | 'risk' | 'tracker' | 'experiment' | 'cannibalization' | 'listing-creator' | 'seo';

// ─── Brain Orchestrator ───

export class Brain extends BaseAgent {
  readonly name = 'brain';
  readonly description = 'Central orchestrator that coordinates all AI agents';

  private recon = new ReconAgent();
  private keyword = new KeywordAgent();
  private review = new ReviewAgent();
  private creative = new CreativeAgent();
  private health = new HealthScorer();
  private correlation = new CorrelationEngine();
  private risk = new RiskAgent();
  private tracker = new TrackerAgent();
  private experiment = new ExperimentAgent();
  private cannibalization = new CannibalizationDetector();
  private listingCreator = new ListingCreatorAgent();
  private seo = new SeoAgent();

  protected getSystemPrompt(_ctx: AgentContext): string {
    return `You are the ASOMARK Brain — the strategic orchestrator and central decision-maker for app store optimization. You coordinate a team of specialized AI agents, synthesize their findings into coherent strategy, and drive measurable improvements in app visibility, conversion, and growth.

## ROLE & DECISION AUTHORITY

You are NOT a simple router. You are the strategic mind that decides WHAT to analyze, WHEN to act, and HOW to synthesize findings into a unified ASO strategy. You own the big picture.

Every recommendation you produce MUST specify one of these authority levels:
- L0 (Auto-Execute): Tracking runs, scraping jobs, data collection, rank snapshots. These execute silently with no user involvement.
- L1 (Execute + Notify): Generating reports, sending alerts, updating internal scores, running scheduled analyses. Execute immediately, inform the user afterward.
- L2 (Suggest + Wait): Metadata changes, new keyword targets, experiment proposals, listing copy suggestions. Present the recommendation with rationale and wait for user approval before proceeding.
- L3 (Confirm Required): Applying experiment results to live listings, changing published titles/descriptions, submitting store updates, any action that modifies what real users see. Require explicit user confirmation with a clear summary of what will change and the associated risks.

When in doubt, escalate to the higher authority level. A missed optimization is recoverable; a bad live change is not.

## AGENT COORDINATION STRATEGY

You have the following specialized agents. Run them at the right time, in the right order, and feed outputs between them intelligently.

**Health Scorer** — Run on: first-ever analysis for any app, immediately after any listing change is detected or applied, weekly on a fixed cadence. The health score is your north star metric for whether the ASO strategy is working. A declining score triggers deeper investigation.

**Recon Agent** — Run on: initial competitor discovery when a new app is added, when a new competitor enters the category top 10, when rank movements suggest a new player gaining ground, quarterly refresh to catch market shifts. Feed competitor data into the Keyword Agent and Creative Agent.

**Keyword Agent** — Run on: initial setup after Recon completes (so competitor keyword gaps are available), after competitor analysis reveals new gaps or opportunities, monthly refresh to catch seasonal trends and search behavior shifts, when health score keyword component drops. Its output feeds directly into Creative Agent and Experiment Agent.

**Creative Agent** — Run on: after keyword research completes (it needs the keyword list), when health score drops below 60 (indicating listing quality problems), when the user requests new listing variants, when experiment results show current copy underperforming. Always run Risk Agent on its output before anything goes live.

**Tracker Agent** — Run on: continuous automated cadence (every 6 hours for rank tracking), on-demand immediately after any listing change goes live (to measure impact), when the user requests a fresh snapshot. This is L0 — fully automated, no user involvement needed.

**Review Agent** — Run on: weekly cadence for sentiment trend monitoring, immediately when average rating drops by 0.2+ stars, when a new app version launches (to catch early feedback), when health score sentiment component declines. Its pain points feed into Creative Agent (address concerns in listing copy) and Keyword Agent (user language = keyword opportunities).

**Experiment Agent** — Run on: after identifying optimization opportunities from Keyword or Creative agents, only when the app has sufficient daily traffic to reach statistical significance within a reasonable timeframe (estimate this), when the user explicitly requests an A/B test. Always validate experiment designs with Risk Agent before launch.

**Risk Agent** — Run BEFORE any listing change goes live, without exception. Also run: after Creative Agent generates new copy (check for policy violations, keyword stuffing, misleading claims), before experiment launch (validate test variants), when a new market or language is targeted, when any L2 or L3 action is proposed.

**Correlation Engine** — Run on: 7 days after any listing change (minimum time for meaningful rank data), when unexpected rank movements are detected (positive or negative), monthly to build the historical understanding of what changes drive what results. Its findings refine future strategy — if title changes correlate with rank improvements, prioritize title optimization.

**SEO Agent** — Run on: initial setup to establish web presence baseline, monthly content refresh cycle, when launching in new markets, when competitor web presence changes significantly.

**Cannibalization Detector** — Run on: after keyword research to check for internal overlap, when managing multiple apps in the same category, when keyword rankings show unexpected drops that could indicate self-competition.

**Listing Creator** — Run on: when the user requests a full listing generation, after keyword and creative analysis provide the foundation data. Always pass output through Risk Agent before presenting to user.

## SYNTHESIS & PRIORITIZATION

Never just concatenate agent outputs. Your job is to THINK across them and produce strategy.

**Impact Scoring** (prioritize in this order):
1. Changes affecting top-3 keywords by volume — these drive the most impressions
2. Changes affecting category rank — this is the multiplier on all keyword rankings
3. Changes to conversion elements (icon, screenshots, short description) — these affect every visitor
4. Long-tail keyword optimizations — incremental but compounding gains

**Effort Estimation**:
- Low effort: Metadata-only changes (title, short description, keyword field). Can be deployed in minutes.
- Medium effort: Screenshot text/ordering changes, description rewrites. Require some design or copywriting work.
- High effort: Icon redesign, full screenshot overhaul, video production, major repositioning. Require significant creative investment.

**Priority Matrix** — Apply this ruthlessly:
- High impact + Low effort = Execute immediately (or as soon as authority level allows). These are your quick wins.
- High impact + High effort = Plan and schedule. Break into phases if possible.
- Low impact + Low effort = Batch into periodic updates. Do not waste user attention on these individually.
- Low impact + High effort = Backlog or skip entirely. Mention only if nothing higher-priority exists.

**Conflict Resolution**: When agents disagree, do NOT silently pick a winner. Example: Keyword Agent says add "free" to the title for +15% search volume, but Risk Agent flags it as potentially misleading for a freemium app. Present BOTH perspectives, quantify the tradeoff (estimated volume gain vs. policy risk severity), and make a recommendation with your reasoning. The user decides on conflicts involving L2+ actions.

## STRATEGIC THINKING

You must connect individual data points into a coherent narrative:

- **Funnel Analysis**: Identify the biggest bottleneck. Are impressions low (keyword/category rank problem)? Are page views low relative to impressions (icon/title problem)? Are installs low relative to page views (screenshots/description/reviews problem)? Focus strategy on the weakest link first.
- **Competitive Dynamics**: Never optimize in a vacuum. If a competitor just changed their title and jumped 5 ranks, that is actionable intelligence. If the top 3 competitors all target a keyword you do not, that is a gap. If you are trading ranks with a specific competitor, understand WHY.
- **Temporal Patterns**: Track whether your changes actually worked. If a title change 2 weeks ago did not improve rankings, do not recommend more title changes — investigate why. Use Correlation Engine data to build an evidence base for what works for THIS specific app in THIS specific category.
- **Diminishing Returns**: Recognize when an app's ASO is "good enough" in one area and resources should shift elsewhere. A health score of 90+ on metadata means further title tweaks yield minimal gains — focus on conversion or reviews instead.
- **Seasonality & Trends**: Factor in seasonal search patterns, holiday trends, and category-specific cycles when timing recommendations.

## COMMUNICATION

**Executive Summary Format**: Every synthesis must answer three questions — What changed since last analysis? Why does it matter? What should we do next?

**Actionable, Not Encyclopedic**: Prioritize the top 3 most impactful actions. If there are 20 possible optimizations, the user needs to know which 3 to focus on THIS WEEK, not a laundry list. Additional items go in a secondary "also consider" section.

**Specificity Over Generality**: Never say "optimize your keywords." Say "Add 'budget tracker' to your title (position 2-3) — 12K monthly searches, difficulty 35, your closest competitor ranks #2 for it and you are not ranking at all."

**Quantify Everything Possible**: Estimated search volume, current vs. target rank, competitor benchmarks, confidence levels, expected timeline for results. Vague recommendations are worthless.

**Explain Your Reasoning**: For L2 and L3 recommendations, briefly explain WHY this action over alternatives. The user should understand the strategic logic, not just the what.

Always respond with valid JSON. No markdown fences.`;
  }

  /**
   * Run a specific agent by name.
   */
  async runAgent(
    agentName: string,
    appId: string,
    ctx: AgentContext = {},
  ): Promise<AgentResult<unknown>> {
    switch (agentName as AgentName) {
      case 'recon':
        return this.recon.discover(appId, ctx);
      case 'keyword':
        return this.keyword.research(appId, ctx);
      case 'review':
        return this.review.analyze(appId, ctx);
      case 'health':
        return this.health.score(appId, ctx);
      case 'correlation':
        return this.correlation.analyze(appId, 30, ctx);
      case 'risk':
        return this.risk.audit(appId, ctx);
      case 'creative': {
        // Creative needs keywords — run keyword first if needed
        const kwResult = await this.keyword.research(appId, ctx);
        return this.creative.generateListings(appId, kwResult.data.topKeywords, ctx);
      }
      case 'tracker':
        return this.tracker.fullTrackingRun(appId, ctx);
      case 'experiment':
        return this.experiment.plan(appId, [], ctx);
      case 'cannibalization':
        return this.cannibalization.detect(appId, ctx);
      case 'listing-creator':
        throw new Error('Use POST /api/projects/:id/generate-listing instead. listing-creator needs projectId.');
      case 'seo':
        throw new Error('Use POST /api/projects/:id/seo/analyze instead. SEO agent needs projectId.');
      default:
        throw new Error(`Unknown agent: ${agentName}`);
    }
  }

  /**
   * Run a full analysis pipeline for an app.
   * Runs agents in optimal order with data flowing between them.
   */
  async fullAnalysis(appId: string, ctx: AgentContext = {}): Promise<AgentResult<FullAnalysis>> {
    this.resetTokens();
    const fullCtx = { ...ctx, appId };
    const actions: AgentAction[] = [];

    // Verify app exists
    const [targetApp] = await db.select().from(apps).where(eq(apps.id, appId));
    if (!targetApp) throw new Error(`App ${appId} not found`);

    let reconResult: ReconReport | null = null;
    let keywordResult: KeywordReport | null = null;
    let reviewResult: ReviewAnalysis | null = null;
    let creativeResult: CreativeReport | null = null;
    let healthResult: HealthReport | null = null;
    let correlationResult: CorrelationReport | null = null;
    let riskResult: RiskReport | null = null;

    // Phase 1: Data gathering (can run in parallel)
    const phase1 = await Promise.allSettled([
      this.recon.discover(appId, fullCtx),
      this.review.analyze(appId, fullCtx),
      this.health.score(appId, fullCtx),
      this.risk.audit(appId, fullCtx),
    ]);

    if (phase1[0]!.status === 'fulfilled') reconResult = phase1[0]!.value.data;
    if (phase1[1]!.status === 'fulfilled') reviewResult = phase1[1]!.value.data;
    if (phase1[2]!.status === 'fulfilled') healthResult = phase1[2]!.value.data;
    if (phase1[3]!.status === 'fulfilled') riskResult = phase1[3]!.value.data;

    // Phase 2: Keyword research (benefits from recon data being in DB)
    try {
      const kwRes = await this.keyword.research(appId, fullCtx);
      keywordResult = kwRes.data;
    } catch (err) {
      // Log but continue
    }

    // Phase 3: Creative (needs keywords)
    if (keywordResult && keywordResult.topKeywords.length > 0) {
      try {
        const crRes = await this.creative.generateListings(appId, keywordResult.topKeywords, fullCtx);
        creativeResult = crRes.data;
      } catch (err) {
        // Log but continue
      }
    }

    // Phase 4: Correlation + Cannibalization (parallel, independent)
    let cannibalizationResult: CannibalizationReport | null = null;

    const phase4 = await Promise.allSettled([
      this.correlation.analyze(appId, 30, fullCtx),
      this.cannibalization.detect(appId, fullCtx),
    ]);

    if (phase4[0]!.status === 'fulfilled') correlationResult = phase4[0]!.value.data;
    if (phase4[1]!.status === 'fulfilled') cannibalizationResult = phase4[1]!.value.data;

    // Phase 5: Synthesize findings
    const summary = await this.synthesize(
      targetApp.name,
      { reconResult, keywordResult, reviewResult, healthResult, riskResult },
      fullCtx,
    );

    // Log orchestration action
    actions.push({
      actionType: 'full_analysis',
      reasoning: `Completed full ASO analysis for ${targetApp.name}. Health: ${healthResult?.overallScore ?? '?'}/100. ${keywordResult?.topKeywords.length ?? 0} keyword opportunities. ${reconResult?.competitors.length ?? 0} competitors tracked.`,
      suggestedChange: summary.nextSteps.slice(0, 3).join('; '),
      authorityLevel: 'L1',
    });

    await this.logActions(actions, fullCtx);

    return {
      data: {
        recon: reconResult,
        keywords: keywordResult,
        reviews: reviewResult,
        creative: creativeResult,
        health: healthResult,
        correlation: correlationResult,
        risk: riskResult,
        cannibalization: cannibalizationResult,
        summary: summary.summary,
        nextSteps: summary.nextSteps,
      },
      actions,
      tokensUsed: this.getTokenUsage(),
    };
  }

  /**
   * Run full analysis with streaming progress callbacks.
   */
  async fullAnalysisStreamed(
    appId: string,
    ctx: AgentContext = {},
    onProgress: (agent: string, message: string, progress: number) => void,
  ): Promise<AgentResult<FullAnalysis>> {
    this.resetTokens();
    const fullCtx = { ...ctx, appId };
    const actions: AgentAction[] = [];

    const [targetApp] = await db.select().from(apps).where(eq(apps.id, appId));
    if (!targetApp) throw new Error(`App ${appId} not found`);

    let reconResult: ReconReport | null = null;
    let keywordResult: KeywordReport | null = null;
    let reviewResult: ReviewAnalysis | null = null;
    let creativeResult: CreativeReport | null = null;
    let healthResult: HealthReport | null = null;
    let correlationResult: CorrelationReport | null = null;
    let riskResult: RiskReport | null = null;

    // Phase 1: Recon + Review (parallel)
    onProgress('recon', 'Discovering competitors...', 5);
    onProgress('review', 'Scraping reviews...', 5);

    const phase1 = await Promise.allSettled([
      this.recon.discover(appId, fullCtx),
      this.review.analyze(appId, fullCtx),
    ]);

    if (phase1[0]!.status === 'fulfilled') {
      reconResult = phase1[0]!.value.data;
      onProgress('recon', `Found ${reconResult.competitors.length} competitors`, 20);
    } else {
      onProgress('recon', 'Recon failed, continuing...', 20);
    }
    if (phase1[1]!.status === 'fulfilled') {
      reviewResult = phase1[1]!.value.data;
      onProgress('review', `Analyzed ${reviewResult.reviewsAnalyzed} reviews`, 30);
    } else {
      onProgress('review', 'Review analysis failed, continuing...', 30);
    }

    // Phase 2: Health + Risk (parallel)
    onProgress('health', 'Calculating ASO health score...', 35);
    onProgress('risk', 'Checking compliance risks...', 35);

    const phase2 = await Promise.allSettled([
      this.health.score(appId, fullCtx),
      this.risk.audit(appId, fullCtx),
    ]);

    if (phase2[0]!.status === 'fulfilled') {
      healthResult = phase2[0]!.value.data;
      onProgress('health', `Health: ${healthResult.overallScore}/100 (${healthResult.grade})`, 45);
    }
    if (phase2[1]!.status === 'fulfilled') {
      riskResult = phase2[1]!.value.data;
      onProgress('risk', `Risk: ${riskResult.riskScore}/100 (${riskResult.grade})`, 50);
    }

    // Phase 3: Keyword research
    onProgress('keyword', 'Mining and scoring keywords with real data...', 55);
    try {
      const kwRes = await this.keyword.research(appId, fullCtx);
      keywordResult = kwRes.data;
      onProgress('keyword', `Scored ${keywordResult.keywordsAnalyzed} keywords`, 70);
    } catch {
      onProgress('keyword', 'Keyword research failed, continuing...', 70);
    }

    // Phase 4: Creative
    if (keywordResult && keywordResult.topKeywords.length > 0) {
      onProgress('creative', 'Generating optimized listing variants...', 75);
      try {
        const crRes = await this.creative.generateListings(appId, keywordResult.topKeywords, fullCtx);
        creativeResult = crRes.data;
        onProgress('creative', `Generated ${creativeResult.variants.length} listing variants`, 85);
      } catch {
        onProgress('creative', 'Creative generation failed, continuing...', 85);
      }
    }

    // Phase 5: Correlation + Cannibalization
    let cannibalizationResult: CannibalizationReport | null = null;

    onProgress('correlation', 'Analyzing change-rank correlations...', 86);
    onProgress('cannibalization', 'Detecting keyword overlap...', 86);

    const phase5 = await Promise.allSettled([
      this.correlation.analyze(appId, 30, fullCtx),
      this.cannibalization.detect(appId, fullCtx),
    ]);

    if (phase5[0]!.status === 'fulfilled') {
      correlationResult = phase5[0]!.value.data;
      onProgress('correlation', `Found ${correlationResult.correlations.length} correlations`, 92);
    } else {
      onProgress('correlation', 'No historical data for correlation', 92);
    }
    if (phase5[1]!.status === 'fulfilled') {
      cannibalizationResult = phase5[1]!.value.data;
      onProgress('cannibalization', `Overlap score: ${cannibalizationResult.overlapScore}/100`, 93);
    }

    // Phase 6: Synthesis
    onProgress('brain', 'Synthesizing strategy...', 95);
    const summary = await this.synthesize(
      targetApp.name,
      { reconResult, keywordResult, reviewResult, healthResult, riskResult },
      fullCtx,
    );

    actions.push({
      actionType: 'full_analysis',
      reasoning: `Completed full ASO analysis for ${targetApp.name}. Health: ${healthResult?.overallScore ?? '?'}/100. ${keywordResult?.topKeywords.length ?? 0} keyword opportunities.`,
      suggestedChange: summary.nextSteps.slice(0, 3).join('; '),
      authorityLevel: 'L1',
    });

    await this.logActions(actions, fullCtx);
    onProgress('brain', 'Analysis complete!', 100);

    return {
      data: {
        recon: reconResult,
        keywords: keywordResult,
        reviews: reviewResult,
        creative: creativeResult,
        health: healthResult,
        correlation: correlationResult,
        risk: riskResult,
        cannibalization: cannibalizationResult,
        summary: summary.summary,
        nextSteps: summary.nextSteps,
      },
      actions,
      tokensUsed: this.getTokenUsage(),
    };
  }

  /**
   * Synthesize findings from multiple agents into a strategy.
   */
  private async synthesize(
    appName: string,
    results: {
      reconResult: ReconReport | null;
      keywordResult: KeywordReport | null;
      reviewResult: ReviewAnalysis | null;
      healthResult: HealthReport | null;
      riskResult: RiskReport | null;
    },
    ctx: AgentContext,
  ): Promise<{ summary: string; nextSteps: string[] }> {
    return this.chatJSON<{ summary: string; nextSteps: string[] }>(
      `Synthesize these ASO analysis results for "${appName}" into a strategic summary.

Health Score: ${results.healthResult ? `${results.healthResult.overallScore}/100 (${results.healthResult.grade})` : 'Not available'}
${results.healthResult ? `Quick wins: ${results.healthResult.quickWins.join(', ')}` : ''}

Competitors Found: ${results.reconResult?.competitors.length ?? 0}
${results.reconResult ? `Keyword gaps: ${results.reconResult.analysis.gaps.slice(0, 5).join(', ')}` : ''}

Keywords: ${results.keywordResult?.topKeywords.length ?? 0} high-value keywords
${results.keywordResult ? `Top 5: ${results.keywordResult.topKeywords.slice(0, 5).map((k) => `"${k.term}" (${k.finalScore})`).join(', ')}` : ''}

Reviews: ${results.reviewResult ? `${results.reviewResult.sentimentBreakdown.positive} positive, ${results.reviewResult.sentimentBreakdown.negative} negative` : 'Not analyzed'}
${results.reviewResult ? `Pain points: ${results.reviewResult.painPoints.slice(0, 3).join(', ')}` : ''}

Risk: ${results.riskResult ? `${results.riskResult.riskScore}/100 (${results.riskResult.grade})` : 'Not checked'}
${results.riskResult && results.riskResult.flags.length > 0 ? `Flags: ${results.riskResult.flags.map((f) => f.description).join(', ')}` : ''}

Respond with JSON:
{
  "summary": "2-3 paragraph executive summary of the ASO situation and strategy",
  "nextSteps": ["prioritized list of specific actions to take, ordered by impact"]
}`,
      ctx,
    );
  }

  /**
   * Get pending strategy actions that need approval.
   */
  async getPendingActions(appId?: string) {
    const where = appId
      ? and(eq(strategyLog.status, 'pending'), eq(strategyLog.appId, appId))
      : eq(strategyLog.status, 'pending');

    return db
      .select()
      .from(strategyLog)
      .where(where)
      .orderBy(desc(strategyLog.createdAt));
  }

  /**
   * Approve a pending strategy action.
   */
  async approveAction(actionId: string) {
    return db
      .update(strategyLog)
      .set({ status: 'approved', approvedAt: new Date() })
      .where(eq(strategyLog.id, actionId))
      .returning();
  }

  /**
   * Reject a pending strategy action.
   */
  async rejectAction(actionId: string) {
    return db
      .update(strategyLog)
      .set({ status: 'rejected' })
      .where(eq(strategyLog.id, actionId))
      .returning();
  }
}

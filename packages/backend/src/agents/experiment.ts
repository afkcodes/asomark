import { db } from '../db/index.js';
import { apps } from '../db/schema/apps.js';
import { experiments, experimentChanges } from '../db/schema/experiments.js';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { BaseAgent, type AgentContext, type AgentAction, type AgentResult } from './base.js';
import type { ScoredKeyword } from './keyword.js';

// ─── Types ───

export interface ExperimentVariant {
  name: string; // 'control' | 'variant_a' | 'variant_b' etc.
  title?: string;
  shortDescription?: string;
  description?: string;
  rationale: string;
}

export interface ExperimentProposal {
  type: 'title' | 'short_description' | 'description' | 'icon' | 'screenshots';
  hypothesis: string;
  variants: ExperimentVariant[];
  expectedImpact: string;
  estimatedDuration: string; // e.g. "7-14 days"
  priority: 'high' | 'medium' | 'low';
}

export interface ExperimentReport {
  appName: string;
  proposals: ExperimentProposal[];
  activeExperiments: Array<{
    id: string;
    type: string;
    status: string;
    startedAt: string | null;
    winner: string | null;
  }>;
  completedExperiments: Array<{
    id: string;
    type: string;
    winner: string | null;
    confidence: number | null;
    applied: boolean;
    learnings: string;
  }>;
  recommendations: string[];
}

// ─── Experiment Agent ───

export class ExperimentAgent extends BaseAgent {
  readonly name = 'experiment';
  readonly description = 'Plans, manages, and analyzes A/B store listing experiments';

  protected getSystemPrompt(ctx: AgentContext): string {
    const isAndroid = ctx.platform !== 'ios';
    return `You are the ASOMARK Experiment Agent — a data-driven A/B testing strategist who designs, prioritizes, and analyzes store listing experiments with statistical rigor. You understand that experiments are the ONLY way to prove what actually drives installs — everything else is hypothesis.

## PLATFORM: ${isAndroid ? 'Google Play' : 'App Store'}

${isAndroid ? `### Google Play Store Listing Experiments
**Testable elements**: Title, short description, long description, icon, feature graphic, screenshots, promotional video.
**How it works**: Google splits organic traffic between control and variant(s). You see install rate per variant in the Play Console.
**Traffic requirements**: Minimum ~1,000 unique store listing visitors per variant for statistically meaningful results. Apps with <500 daily visitors will need 14-28 days; apps with >5,000 daily visitors can conclude in 3-7 days.
**Variant limits**: 1 control + up to 3 variants per experiment (but 1 control + 1 variant is cleanest for attribution).
**Duration**: Minimum 7 days (to capture weekday + weekend behavior). Typical: 7-14 days. Maximum meaningful: 28 days (beyond this, external factors dominate).
**Key constraint**: Only ONE experiment can run at a time per app. Queue experiments by priority.` : `### App Store Product Page Optimization (PPO)
**Testable elements**: App icon, screenshots (up to 3 sets), app previews (video).
**NOT testable**: Title, subtitle, description, promotional text, keywords.
**How it works**: Apple splits organic traffic and reports conversion rate per treatment.
**Variant limits**: Up to 3 treatments vs 1 control.
**Duration**: Tests run for up to 90 days. Apple recommends minimum 7 days.
**Key constraint**: PPO requires iOS 15+ users, which limits your effective sample to ~85% of traffic.
**Localization**: Each localization can have its own test (e.g., test different screenshots for EN-US vs EN-GB).`}

## EXPERIMENT DESIGN PRINCIPLES

### The Isolation Rule
Every experiment MUST test exactly ONE variable change. This is non-negotiable because:
- Testing title + icon simultaneously means you can't attribute results to either change
- If a multi-variable test wins, you don't know which change drove the improvement — and you might keep an element that actually hurt conversion
- If a multi-variable test loses, you might discard a winning change because it was paired with a losing one

**Exception**: If two changes are logically coupled (e.g., changing the app name in the title AND the icon that shows the name), they can be tested together as a "rebrand" experiment.

### Hypothesis Framework
Every experiment proposal must have a structured hypothesis:

**Format**: "If we change [element] from [current] to [proposed], then [metric] will [increase/decrease] by approximately [magnitude] because [mechanism]."

**Good hypothesis**: "If we change the title from 'MyApp - Finance Helper' to 'MyApp - Expense Tracker & Budget Planner', then install conversion will increase by 5-15% because 'expense tracker' has 3x more search volume than 'finance helper' and will improve keyword ranking visibility."

**Bad hypothesis**: "Changing the title might improve downloads." (No specific mechanism, no magnitude estimate, not falsifiable.)

### Impact Estimation Framework
Prioritize experiments by expected impact on the install funnel:

**Highest impact (test first)**:
1. **Icon** — Affects EVERY impression across search, browse, and ads. A 10% icon conversion improvement compounds across all traffic sources. Test this first if the current icon hasn't been validated.
2. **Title** — Affects both search ranking (keyword component) AND click-through rate. A title change is simultaneously an SEO and conversion experiment.
3. **Screenshots (first 2)** — The first 2 screenshots are visible without scrolling on most devices. They're the primary conversion element on the store page.

**Medium impact**:
4. **Short description** — Visible on search result cards. Affects click-through from search.
5. **Feature graphic** — Shown prominently on the store page but only on Android.
6. **Screenshots (3-8)** — Diminishing returns as users rarely scroll past screenshot 3-4.

**Lower impact (test after higher-priority elements)**:
7. **Long description** — Rarely read in full. Most impact is on keyword indexing, not conversion.
8. **Video** — Only auto-plays on WiFi. High production cost relative to impact.

### Statistical Rigor

**Sample size requirements**:
- For detecting a 5% relative conversion lift with 80% power and 95% confidence: ~16,000 visitors per variant
- For detecting a 10% lift: ~4,000 visitors per variant
- For detecting a 20% lift: ~1,000 visitors per variant

When proposing experiment duration, estimate based on the app's daily visitor count:
- \`estimated_days = required_visitors_per_variant * num_variants / daily_visitors\`
- Round up and add 1-2 days buffer
- If estimated duration > 28 days, the experiment is likely not worth running for small effect sizes — focus on bolder changes that would produce >10% lifts

**Stopping rules**:
- Never stop an experiment before 7 days (even if early results look conclusive) — weekday/weekend effects can be dramatic
- Don't peek at results daily and stop early when you see a winner — this inflates false positive rates
- If an experiment shows a clear LOSER (one variant is 20%+ worse), it's acceptable to stop early to protect conversion

### Learning from Previous Experiments

When previous experiment data is provided:
- NEVER propose testing something that has already been conclusively proven (winner with >90% confidence)
- Build on confirmed learnings: if "benefit-driven title" beat "keyword-only title", the next title experiment should test different benefit angles, not re-test benefit vs keyword
- Investigate UNEXPECTED results: if a "worse" variant surprisingly won, the mechanism may reveal something important about user psychology in this category
- Track which element types produce the biggest lifts for this specific app — focus future experiments there
- If a previous experiment showed "no winner" (inconclusive), consider whether the change was too subtle. Propose a bolder version of the same hypothesis.

### Variant Design Best Practices

**Control**: Always the current live listing. Never modify the control.

**Treatment variants**:
- Each variant should test a DISTINCT strategic hypothesis, not just word substitutions
- Include the specific mechanism: WHY would this variant convert better? (Different value proposition? Different emotional trigger? Different keyword targeting? Different visual hierarchy?)
- Respect all platform constraints (character limits, banned words, etc.)
- Ensure variants are different enough to produce a measurable effect. Changing one word in a title is unlikely to produce statistically significant results.

**Character limit compliance**:
- Title: ${isAndroid ? '50' : '30'} characters max (include the EXACT character count for each variant)
- Short description: 80 characters max
- BANNED words: "Best", "#1", "Free", "Top", "Number One" — never include in ANY variant

Always respond with valid JSON. No markdown fences.`;
  }

  /**
   * Plan experiments based on current listing analysis.
   * L2 — requires approval before creating experiments.
   */
  async plan(
    appId: string,
    topKeywords: ScoredKeyword[] = [],
    ctx: AgentContext = {},
  ): Promise<AgentResult<ExperimentReport>> {
    this.resetTokens();
    const fullCtx = { ...ctx, appId };
    const actions: AgentAction[] = [];

    // 1. Get app
    const [targetApp] = await db.select().from(apps).where(eq(apps.id, appId));
    if (!targetApp) throw new Error(`App ${appId} not found`);
    fullCtx.platform = (targetApp.platform as 'android' | 'ios') ?? 'android';

    // 2. Get existing experiments
    const allExperiments = await db
      .select()
      .from(experiments)
      .where(eq(experiments.appId, appId))
      .orderBy(desc(experiments.startedAt));

    const active = allExperiments.filter((e) =>
      ['running', 'monitoring', 'creating'].includes(e.status ?? ''),
    );
    const completed = allExperiments.filter((e) =>
      ['winner', 'no_winner', 'applied'].includes(e.status ?? ''),
    );

    // 3. Get previous learnings
    const previousLearnings = completed
      .slice(0, 10)
      .map((e) => ({
        type: e.type,
        winner: e.winner,
        confidence: e.confidence,
        applied: e.applied,
        variants: e.variantsJson,
      }));

    // 4. Generate experiment proposals via LLM
    const keywordContext = topKeywords
      .slice(0, 10)
      .map((k) => `"${k.term}" (score: ${k.finalScore}, rank: ${k.currentRank ?? 'unranked'})`)
      .join(', ');

    const proposals = await this.chatJSON<{
      proposals: Array<{
        type: string;
        hypothesis: string;
        variants: Array<{
          name: string;
          title?: string;
          shortDescription?: string;
          description?: string;
          rationale: string;
        }>;
        expectedImpact: string;
        estimatedDuration: string;
        priority: string;
      }>;
      recommendations: string[];
    }>(
      `Plan A/B experiments for "${targetApp.name}" (${targetApp.platform}).

App: ${targetApp.name} (${targetApp.packageName})
Category: ${targetApp.category ?? 'unknown'}

Top keywords: ${keywordContext || 'No keywords scored yet'}

Active experiments: ${active.length}
Previous experiments: ${JSON.stringify(previousLearnings.slice(0, 5), null, 2)}

Generate 2-4 experiment proposals. Each should:
1. Test ONE variable only
2. Have a clear hypothesis
3. Include 2-3 variants (control + 1-2 treatments)
4. Not overlap with active experiments
5. Build on learnings from previous experiments

For title experiments: respect ${fullCtx.platform === 'ios' ? '30' : '50'} char limit.
For short description: respect 80 char limit.
BANNED words: "Best", "#1", "Free", "Top"

Respond with JSON:
{
  "proposals": [
    {
      "type": "title|short_description|description|icon|screenshots",
      "hypothesis": "Changing X will increase conversion because Y",
      "variants": [
        { "name": "control", "title": "current title", "rationale": "baseline" },
        { "name": "variant_a", "title": "new title", "rationale": "why this might work" }
      ],
      "expectedImpact": "+5-10% conversion",
      "estimatedDuration": "7-14 days",
      "priority": "high|medium|low"
    }
  ],
  "recommendations": ["strategic advice based on experiment history"]
}`,
      fullCtx,
      { maxTokens: 4096 },
    );

    // 5. Log actions
    for (const proposal of proposals.proposals) {
      actions.push({
        actionType: 'experiment_proposal',
        reasoning: `Proposed ${proposal.type} experiment: ${proposal.hypothesis}`,
        suggestedChange: `${proposal.variants.length} variants, priority: ${proposal.priority}`,
        authorityLevel: 'L2',
      });
    }

    await this.logActions(actions, fullCtx);

    const report: ExperimentReport = {
      appName: targetApp.name,
      proposals: proposals.proposals.map((p) => ({
        ...p,
        type: p.type as ExperimentProposal['type'],
        priority: p.priority as ExperimentProposal['priority'],
      })),
      activeExperiments: active.map((e) => ({
        id: e.id,
        type: e.type ?? '',
        status: e.status ?? '',
        startedAt: e.startedAt?.toISOString() ?? null,
        winner: e.winner,
      })),
      completedExperiments: completed.slice(0, 10).map((e) => ({
        id: e.id,
        type: e.type ?? '',
        winner: e.winner,
        confidence: e.confidence,
        applied: e.applied ?? false,
        learnings: '',
      })),
      recommendations: proposals.recommendations,
    };

    return { data: report, actions, tokensUsed: this.getTokenUsage() };
  }

  /**
   * Create an experiment from a proposal.
   * Stores in DB with 'pending' status (needs approval to start).
   */
  async createExperiment(
    appId: string,
    proposal: ExperimentProposal,
  ): Promise<string> {
    const [exp] = await db
      .insert(experiments)
      .values({
        appId,
        platform: 'android',
        type: proposal.type,
        status: 'pending',
        variantsJson: proposal.variants,
      })
      .returning();

    return exp!.id;
  }

  /**
   * Start an approved experiment (mark as running).
   * L3 — requires explicit confirmation.
   */
  async startExperiment(experimentId: string): Promise<void> {
    await db
      .update(experiments)
      .set({
        status: 'running',
        startedAt: new Date(),
      })
      .where(eq(experiments.id, experimentId));
  }

  /**
   * Record experiment results and determine winner.
   */
  async recordResults(
    experimentId: string,
    results: Record<string, { installs: number; conversion: number }>,
  ): Promise<{ winner: string | null; confidence: number }> {
    const variants = Object.entries(results);
    if (variants.length < 2) return { winner: null, confidence: 0 };

    // Simple winner determination: highest conversion rate
    let bestVariant = variants[0]!;
    for (const variant of variants.slice(1)) {
      if (variant[1].conversion > bestVariant[1].conversion) {
        bestVariant = variant;
      }
    }

    // Simple confidence: conversion lift percentage
    const control = results['control'];
    const winnerData = bestVariant[1];

    let confidence = 0;
    if (control && winnerData.conversion > control.conversion) {
      const lift = (winnerData.conversion - control.conversion) / control.conversion;
      // Rough confidence based on lift and sample size
      const totalInstalls = variants.reduce((sum, [, v]) => sum + v.installs, 0);
      confidence = Math.min(
        0.99,
        lift * Math.min(1, totalInstalls / 1000) * 0.95,
      );
    }

    const isWinner = confidence >= 0.9;

    await db
      .update(experiments)
      .set({
        status: isWinner ? 'winner' : 'no_winner',
        endedAt: new Date(),
        resultsJson: results,
        winner: isWinner ? bestVariant[0] : null,
        confidence,
      })
      .where(eq(experiments.id, experimentId));

    return {
      winner: isWinner ? bestVariant[0] : null,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  /**
   * Apply winning experiment variant.
   * L3 — requires explicit confirmation.
   */
  async applyWinner(experimentId: string): Promise<void> {
    const [exp] = await db
      .select()
      .from(experiments)
      .where(eq(experiments.id, experimentId));

    if (!exp || !exp.winner) {
      throw new Error('No winner to apply');
    }

    await db
      .update(experiments)
      .set({ status: 'applied', applied: true })
      .where(eq(experiments.id, experimentId));

    // Log the change
    const variants = exp.variantsJson as ExperimentVariant[];
    const winnerVariant = variants?.find((v) => v.name === exp.winner);

    if (winnerVariant && exp.type) {
      await db.insert(experimentChanges).values({
        experimentId,
        fieldChanged: exp.type,
        oldValue: variants?.find((v) => v.name === 'control')?.title ?? 'control',
        newValue: winnerVariant.title ?? winnerVariant.shortDescription ?? winnerVariant.name,
        changeDate: new Date().toISOString().split('T')[0],
        impactMetricsJson: exp.resultsJson,
      });
    }
  }
}

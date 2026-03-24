import { db } from '../db/index.js';
import { apps } from '../db/schema/apps.js';
import { changeLog } from '../db/schema/changelog.js';
import { rankCorrelations } from '../db/schema/changelog.js';
import { rankSnapshots } from '../db/schema/rankings.js';
import { keywords } from '../db/schema/keywords.js';
import { eq, and, gte, sql } from 'drizzle-orm';
import { BaseAgent, type AgentContext, type AgentAction, type AgentResult } from './base.js';

// ─── Types ───

export interface CorrelationEntry {
  changeId: string;
  changeType: string;
  field: string;
  changeDate: string;
  keyword: string;
  rankBefore: number | null;
  rankAfter: number | null;
  rankDelta: number;
  daysToEffect: number;
  confidence: number;
}

export interface CorrelationReport {
  appName: string;
  period: { from: string; to: string };
  correlations: CorrelationEntry[];
  insights: string[];
  patterns: string[];
}

// ─── Correlation Engine ───

export class CorrelationEngine extends BaseAgent {
  readonly name = 'correlation';
  readonly description = 'Analyzes listing changes and their impact on keyword rankings';

  protected getSystemPrompt(_ctx: AgentContext): string {
    return `You are the ASOMARK Correlation Engine — a rigorous data analyst specializing in causal inference for app store optimization. You determine whether listing changes CAUSED ranking movements or merely coincided with them. Your analysis directly informs future strategy — false positives lead to wasted effort, false negatives mean missed learnings.

## CAUSAL ANALYSIS FRAMEWORK

### The Attribution Problem in ASO
Ranking changes can be caused by:
1. **Our listing changes** (the signal we want to isolate)
2. **Competitor listing changes** (a competitor optimizing can displace our rankings even if we did nothing)
3. **Algorithm updates** (Google/Apple periodically reweigh ranking signals — affects all apps simultaneously)
4. **Seasonal trends** (search volume shifts affect competitive dynamics, e.g., "tax app" spikes in March-April)
5. **Install velocity changes** (viral moments, press coverage, ad campaigns alter ranking signals temporarily)
6. **Review velocity/sentiment shifts** (a sudden wave of negative reviews can hurt rankings)
7. **Random noise** (day-to-day rank fluctuations of ±1-2 positions are statistically expected)

Your job is to separate signal (cause #1) from noise (causes #2-7).

### Temporal Analysis Rules

**Google Play reindexing timeline**:
- Title changes: 1-3 days to reflect in rankings
- Short description changes: 2-5 days
- Full description changes: 3-7 days (longer because Google crawls description text less frequently than metadata)
- Icon/screenshot changes: No direct ranking impact, but conversion rate changes may affect install velocity → rankings in 7-14 days

**Attribution windows**:
- The PRIMARY attribution window is 3-7 days after a change. Rank movements within this window have the strongest causal claim.
- 7-14 days: secondary window — possible but weaker (more confounders accumulate over time)
- 14+ days: very weak attribution — too many other factors could have intervened

**Multi-change problem**:
When multiple listing changes happen within 7 days of each other, individual attribution becomes unreliable. In this case:
- Report the COMBINED effect with lower confidence
- Note which change was most likely the primary driver based on the type of field changed (title changes have the most direct ranking impact)
- Recommend that future changes be made one at a time with 7+ day gaps for clean attribution

### Confidence Scoring Methodology

**90-100 (Strong Causal Link)**:
- Single isolated change (no other changes within 14 days before or 7 days after)
- Clear rank movement (±5+ positions) starting within the expected reindexing window
- The direction makes mechanical sense (adding a keyword → rank improvement for that keyword)
- No competing explanation (no algorithm update, no competitor changes, no seasonal shift)
- Movement sustained for 3+ days (not a one-day spike)

**70-89 (Likely Causal)**:
- Change is isolated or the primary change in a cluster
- Rank movement aligns with timing expectations
- Direction makes sense mechanically
- One minor competing explanation exists but is less likely (e.g., a small seasonal trend)
- Movement sustained for 2+ days

**50-69 (Possible but Uncertain)**:
- Multiple changes close together make isolation difficult
- Timing roughly aligns but with some ambiguity
- A competing explanation is plausible (competitor change at same time, possible algorithm shift)
- Movement may be smaller (±3-4 positions) and within normal volatility range

**30-49 (Weak Attribution)**:
- Several confounders present
- Timing doesn't cleanly align with reindexing expectations
- Movement is small (±1-2 positions) — could be random noise
- Multiple competing explanations

**0-29 (Speculative / No Link)**:
- No plausible causal mechanism (e.g., description keyword change → rank movement for a keyword NOT in the description)
- Timing completely misaligned
- Movement is within normal daily volatility
- Strong competing explanation (algorithm update affecting all apps)

### Pattern Recognition

Look for these higher-order patterns across multiple correlations:

**Validated strategies**: If title changes consistently correlate with rank improvements (multiple instances, high confidence), this becomes an evidence-based recommendation to prioritize title optimization.

**Ineffective changes**: If description changes never correlate with measurable rank movements for this app, that's valuable intelligence — it means description optimization has lower ROI than title/short description for this specific app and category.

**Competitor response patterns**: If our rank improvements on keyword X consistently trigger competitor listing changes within 14 days, that indicates active competitive monitoring and means we should expect counter-moves.

**Decay patterns**: How quickly do rank improvements fade? If a title change causes a +5 position jump that decays to +2 within 30 days, that tells us the change was partially offset by competitors adapting.

**Cumulative effects**: Sometimes individual changes show modest correlations (±2 positions each) but the cumulative effect of multiple well-executed changes produces significant overall improvement. Flag these compounding patterns.

### Insight Quality Standards

Every insight must be:
- **Falsifiable**: State what evidence would disprove your claim
- **Actionable**: "Title changes work for this app" → "Prioritize title optimization for keyword X based on 3 confirmed correlations"
- **Quantified**: Include the magnitude of effect (positions gained/lost), confidence level, and attribution window
- **Time-bounded**: Specify whether this is a short-term observation or a validated long-term pattern

Always respond with valid JSON. No markdown fences.`;
  }

  /**
   * Analyze change → rank correlations for an app over a time period.
   * L0 for data gathering, L1 for the report.
   */
  async analyze(
    appId: string,
    daysBack = 30,
    ctx: AgentContext = {},
  ): Promise<AgentResult<CorrelationReport>> {
    this.resetTokens();
    const fullCtx = { ...ctx, appId };
    const actions: AgentAction[] = [];

    // 1. Get app
    const [targetApp] = await db.select().from(apps).where(eq(apps.id, appId));
    if (!targetApp) throw new Error(`App ${appId} not found`);

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysBack);
    const fromStr = fromDate.toISOString().split('T')[0]!;
    const toStr = new Date().toISOString().split('T')[0]!;

    // 2. Get all listing changes in the period
    const changes = await db
      .select()
      .from(changeLog)
      .where(
        and(
          eq(changeLog.appId, appId),
          gte(changeLog.timestamp, fromDate),
        ),
      )
      .orderBy(changeLog.timestamp);

    // 3. Get all rank snapshots in the period
    const ranks = await db
      .select()
      .from(rankSnapshots)
      .where(
        and(
          eq(rankSnapshots.appId, appId),
          gte(rankSnapshots.date, fromStr),
        ),
      )
      .orderBy(rankSnapshots.date);

    if (changes.length === 0 || ranks.length === 0) {
      return {
        data: {
          appName: targetApp.name,
          period: { from: fromStr, to: toStr },
          correlations: [],
          insights: ['Not enough data — need both listing changes and rank snapshots to correlate'],
          patterns: [],
        },
        actions: [],
        tokensUsed: this.getTokenUsage(),
      };
    }

    // 4. Build rank timeline per keyword
    const rankTimeline: Record<string, Array<{ date: string; rank: number; keywordId: string }>> = {};
    for (const r of ranks) {
      const kid = r.keywordId!;
      if (!rankTimeline[kid]) rankTimeline[kid] = [];
      rankTimeline[kid]!.push({ date: r.date!, rank: r.rank!, keywordId: kid });
    }

    // 5. Get keyword names
    const keywordIds = Object.keys(rankTimeline);
    const keywordNames: Record<string, string> = {};
    if (keywordIds.length > 0) {
      const kws = await db
        .select()
        .from(keywords)
        .where(sql`${keywords.id} = ANY(${keywordIds})`);
      for (const kw of kws) {
        keywordNames[kw.id] = kw.term;
      }
    }

    // 6. Use LLM to analyze correlations
    const changeData = changes.map((c) => ({
      id: c.id,
      type: c.changeType,
      field: c.field,
      oldValue: c.oldValue,
      newValue: c.newValue,
      date: c.timestamp?.toISOString().split('T')[0],
    }));

    const rankData: Record<string, Array<{ date: string; rank: number }>> = {};
    for (const [kid, timeline] of Object.entries(rankTimeline)) {
      const name = keywordNames[kid] ?? kid;
      rankData[name] = timeline.map((t) => ({ date: t.date, rank: t.rank }));
    }

    const result = await this.chatJSON<{
      correlations: Array<{
        changeIndex: number;
        keyword: string;
        rankBefore: number | null;
        rankAfter: number | null;
        daysToEffect: number;
        confidence: number;
      }>;
      insights: string[];
      patterns: string[];
    }>(
      `Analyze the correlation between listing changes and ranking changes for "${targetApp.name}".

Listing changes (chronological):
${JSON.stringify(changeData, null, 2)}

Rank timelines per keyword:
${JSON.stringify(rankData, null, 2)}

For each change, identify which keywords were affected and by how much.
Consider that ranking changes typically take 3-7 days to show.

Respond with JSON:
{
  "correlations": [
    {
      "changeIndex": 0,
      "keyword": "keyword name",
      "rankBefore": <rank before change>,
      "rankAfter": <rank after change>,
      "daysToEffect": <days between change and rank movement>,
      "confidence": <0-100>
    }
  ],
  "insights": ["insight1", ...],
  "patterns": ["pattern1", ...]
}`,
      fullCtx,
      { maxTokens: 4096 },
    );

    // 7. Build correlation entries
    const correlations: CorrelationEntry[] = result.correlations.map((c) => {
      const change = changes[c.changeIndex];
      return {
        changeId: change?.id ?? '',
        changeType: change?.changeType ?? '',
        field: change?.field ?? '',
        changeDate: change?.timestamp?.toISOString().split('T')[0] ?? '',
        keyword: c.keyword,
        rankBefore: c.rankBefore,
        rankAfter: c.rankAfter,
        rankDelta: (c.rankBefore ?? 0) - (c.rankAfter ?? 0), // positive = improvement
        daysToEffect: c.daysToEffect,
        confidence: c.confidence,
      };
    });

    // 8. Save correlations to DB
    for (const corr of correlations) {
      if (corr.changeId) {
        await db.insert(rankCorrelations).values({
          changeLogId: corr.changeId,
          rankBefore: corr.rankBefore,
          rankAfter: corr.rankAfter,
          daysToEffect: corr.daysToEffect,
          confidence: corr.confidence,
          notes: `${corr.keyword}: ${corr.rankDelta > 0 ? '+' : ''}${corr.rankDelta} positions`,
        }).onConflictDoNothing();
      }
    }

    // 9. Log actions
    const significant = correlations.filter((c) => c.confidence >= 70);
    if (significant.length > 0) {
      actions.push({
        actionType: 'correlation_found',
        reasoning: `Found ${significant.length} high-confidence correlations between listing changes and rank movements`,
        suggestedChange: significant
          .slice(0, 3)
          .map((c) => `${c.field} change → "${c.keyword}" ${c.rankDelta > 0 ? 'gained' : 'lost'} ${Math.abs(c.rankDelta)} positions`)
          .join('; '),
        authorityLevel: 'L1',
      });
    }

    await this.logActions(actions, fullCtx);

    return {
      data: {
        appName: targetApp.name,
        period: { from: fromStr, to: toStr },
        correlations,
        insights: result.insights,
        patterns: result.patterns,
      },
      actions,
      tokensUsed: this.getTokenUsage(),
    };
  }
}

import { db } from '../db/index.js';
import { apps } from '../db/schema/apps.js';
import { keywords } from '../db/schema/keywords.js';
import { keywordOpportunities } from '../db/schema/opportunities.js';
import { rankSnapshots } from '../db/schema/rankings.js';
import { listingSnapshots } from '../db/schema/listings.js';
import { projects, discoveredKeywords } from '../db/schema/projects.js';
import { eq, and, desc } from 'drizzle-orm';
import { PlayStoreSearchScraper } from '../scrapers/playstore/index.js';
import { PlayStoreDetailsScraper } from '../scrapers/playstore/index.js';
import { BaseAgent, type AgentContext, type AgentAction, type AgentResult } from './base.js';
import { changeDetector, type DetectedChange } from '../lib/change-detector.js';

// ─── Types ───

export interface RankChange {
  keyword: string;
  keywordId: string;
  previousRank: number | null;
  currentRank: number | null;
  delta: number; // positive = improved, negative = dropped
}

export interface CompetitorChange {
  appId: string;
  appName: string;
  changes: DetectedChange[];
}

export interface TrackingReport {
  appName: string;
  date: string;
  keywordsTracked: number;
  rankChanges: RankChange[];
  significantMoves: RankChange[]; // |delta| >= 5
  competitorChanges: CompetitorChange[];
  alerts: string[];
}

// ─── Tracker Agent ───

export class TrackerAgent extends BaseAgent {
  readonly name = 'tracker';
  readonly description = 'Daily rank tracking, competitor spy, and alert generation';

  private playSearch = new PlayStoreSearchScraper();
  private playDetails = new PlayStoreDetailsScraper();

  protected getSystemPrompt(_ctx: AgentContext): string {
    return `You are the ASOMARK Tracker Agent — an expert system for monitoring keyword rankings, detecting competitor movements, and generating prioritized intelligence alerts for App Store Optimization.

## Rank Change Analysis

Classify every rank movement by severity:
- NOTABLE (±3 positions): Worth logging but usually within normal daily volatility. Track whether it persists over 2-3 days before acting.
- SIGNIFICANT (±5 positions): Real movement that demands attention. Investigate possible causes — listing changes, competitor actions, or algorithm shifts.
- CRITICAL (±10+ positions): Immediate action required. Something fundamental changed — a new competitor entered, an algorithm update hit, or a listing issue occurred.

When analyzing rank changes:
- Compare day-over-day for immediate signals and week-over-week for confirmed trends. A single-day spike is noise until confirmed by a second data point.
- Differentiate organic fluctuation from real movement. If 80%+ of tracked keywords shift in the same direction on the same day, suspect an algorithm update or indexing event, not individual keyword dynamics.
- New apps entering the top results can displace existing rankings without any fault of the tracked app — flag these as "displacement by new entrant" rather than a regression.
- Account for seasonal context: holiday periods (Nov-Dec), back-to-school (Aug-Sep), and new year resolution spikes (Jan) all cause predictable volatility in specific categories.

## Competitor Intelligence

Monitor competitor listings for strategic changes:
- Title changes: The highest-signal metadata change. A competitor changing their title is almost certainly targeting new keywords or repositioning. Extract the new keywords they are targeting.
- Description changes: Watch for new keyword insertions, feature announcements, or repositioning language. Compare old vs new to identify their strategic intent.
- Screenshot and icon changes: Visual changes often indicate an active A/B test or a major repositioning effort. Note the timing relative to their rank movements.
- Rapid changes followed by reverts (within 3-7 days) strongly suggest the competitor is running A/B experiments. Log these patterns — reverts to original mean the experiment lost; keeping the change means it won.

When a new app appears in the top 10 for any tracked keyword that was not there in the previous snapshot, flag it as a new competitor detection event with its current metadata captured.

Always correlate competitor listing changes with their subsequent rank movements. A competitor that changed their title and gained 5+ positions is a validated signal that their new keyword strategy is working.

## Alert Prioritization

Generate alerts at four severity levels:

CRITICAL alerts:
- Losing position 1, 2, or 3 for any high-value keyword (these positions capture the vast majority of organic installs)
- A direct competitor overtaking our app on a primary keyword
- Falling off the first page (position 11+) for a keyword where we were previously top 10
- More than 50% of tracked keywords dropping simultaneously (likely algorithm update or account issue)

HIGH alerts:
- ±5 or greater rank change on any actively tracked keyword
- A new competitor appearing in the top 10 for a primary keyword
- A competitor making title changes that target our core keywords
- Losing 3+ positions on more than 3 keywords simultaneously

MEDIUM alerts:
- ±3 rank change on tracked keywords
- Competitor listing changes detected (description, screenshots, icon)
- Gradual decline trend detected (3+ consecutive days of small drops)

LOW alerts:
- Minor fluctuations within ±2 positions (log but do not surface prominently)
- New keyword ranking opportunities spotted (app appeared in results for previously untracked terms)
- Competitor changes on non-primary keywords

## Pattern Recognition

Identify and report on these patterns:
- Daily and weekly rank volatility: Ranks often shift between weekdays and weekends due to different user search behavior. Establish a baseline volatility band for each keyword before flagging movements.
- Algorithm update detection: When 60%+ of tracked keywords across multiple apps move significantly on the same day, flag a suspected algorithm update. Note the date and magnitude for historical correlation.
- Seasonal trends: Track category-level movement during known seasonal periods and distinguish category-wide lifts from app-specific gains.
- Category-wide vs app-specific: If competitors in the same category show similar rank movements, the cause is external (algorithm, seasonality). If only the tracked app moves, the cause is internal (listing change, review velocity, install velocity).
- Trend persistence: A movement that holds for 3+ days is a trend. A movement that reverts within 1-2 days is noise.

## Reporting Guidelines

When generating reports:
- Lead with the most actionable finding. Do not bury critical alerts under routine data.
- Separate signal from noise: clearly label items as "actionable" vs "informational."
- For each significant rank change, provide context: what likely caused it, whether it is part of a trend, and what (if anything) should be done.
- Track trajectory: classify each keyword as IMPROVING (3+ day upward trend), STABLE (within ±2 of baseline), or DECLINING (3+ day downward trend).
- Compare our trajectory against competitors. If we are declining while a competitor is rising on the same keyword, that is a competitive displacement and requires immediate strategy review.
- Summarize the overall health: how many keywords improved vs declined vs stable, and whether the trend direction is net positive or net negative.

Always respond with valid JSON. No markdown fences.`;
  }

  /**
   * Track keyword rankings for an app and all its tracked keywords.
   * L0 — runs automatically, no approval needed.
   */
  async trackRankings(
    appId: string,
    ctx: AgentContext = {},
  ): Promise<AgentResult<TrackingReport>> {
    this.resetTokens();
    const fullCtx = { ...ctx, appId };
    const actions: AgentAction[] = [];
    const today = new Date().toISOString().split('T')[0]!;
    const region = ctx.region ?? 'us';

    // 1. Get app
    const [targetApp] = await db.select().from(apps).where(eq(apps.id, appId));
    if (!targetApp) throw new Error(`App ${appId} not found`);
    if (!targetApp.packageName) throw new Error(`App ${appId} has no packageName`);

    // 2. Get keywords to track — use project's discovered keywords (rank-verified, relevant)
    //    Falls back to global keywords table only if no project context exists
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.appId, appId));

    let trackedKeywords: { id: string; term: string }[] = [];

    if (project) {
      // Only track keywords the user has explicitly marked for tracking
      const discovered = await db
        .select({
          keyword: discoveredKeywords.keyword,
        })
        .from(discoveredKeywords)
        .where(and(
          eq(discoveredKeywords.projectId, project.id),
          eq(discoveredKeywords.isTracking, true),
        ));

      // Match tracked keywords to the global keywords table to get IDs
      for (const dk of discovered) {
        const [kw] = await db
          .select({ id: keywords.id, term: keywords.term })
          .from(keywords)
          .where(and(eq(keywords.term, dk.keyword), eq(keywords.platform, targetApp.platform)));

        if (kw) {
          trackedKeywords.push(kw);
        } else {
          // Create entry in global keywords table if it doesn't exist yet
          const [inserted] = await db
            .insert(keywords)
            .values({ term: dk.keyword, platform: targetApp.platform, lastUpdated: new Date() })
            .onConflictDoNothing()
            .returning();
          if (inserted) trackedKeywords.push({ id: inserted.id, term: inserted.term });
        }
      }
    } else {
      // Fallback: use keywords from keyword_opportunities for this app
      trackedKeywords = await db
        .select({ id: keywords.id, term: keywords.term })
        .from(keywords)
        .innerJoin(keywordOpportunities, eq(keywords.id, keywordOpportunities.keywordId))
        .where(eq(keywordOpportunities.appId, appId));
    }

    if (trackedKeywords.length === 0) {
      return {
        data: {
          appName: targetApp.name,
          date: today,
          keywordsTracked: 0,
          rankChanges: [],
          significantMoves: [],
          competitorChanges: [],
          alerts: ['No keywords marked for tracking. Enable tracking on discovered keywords first.'],
        },
        actions: [],
        tokensUsed: this.getTokenUsage(),
      };
    }

    // 3. Get current ranks for all keywords
    const terms = trackedKeywords.map((k) => k.term);
    const rankMap = await this.playSearch.getRanks(
      terms.slice(0, 100), // Cap at 100 keywords per run
      targetApp.packageName,
      { lang: 'en', country: region },
    );

    // 4. Get previous ranks for comparison
    const previousRanks = new Map<string, number | null>();
    for (const kw of trackedKeywords) {
      const [prev] = await db
        .select()
        .from(rankSnapshots)
        .where(
          and(
            eq(rankSnapshots.appId, appId),
            eq(rankSnapshots.keywordId, kw.id),
          ),
        )
        .orderBy(desc(rankSnapshots.date))
        .limit(1);
      previousRanks.set(kw.id, prev?.rank ?? null);
    }

    // 5. Save new rank snapshots and compute changes
    const rankChanges: RankChange[] = [];

    for (const kw of trackedKeywords) {
      const currentRank = rankMap.get(kw.term) ?? null;
      const prevRank = previousRanks.get(kw.id) ?? null;

      // Save snapshot
      await db.insert(rankSnapshots).values({
        appId,
        keywordId: kw.id,
        platform: targetApp.platform,
        region,
        rank: currentRank,
        date: today,
      });

      // Compute delta (positive = improved = rank number decreased)
      let delta = 0;
      if (prevRank !== null && currentRank !== null) {
        delta = prevRank - currentRank; // prev=10, current=5 → delta=+5 (improved)
      } else if (prevRank === null && currentRank !== null) {
        delta = 100; // Newly ranked
      } else if (prevRank !== null && currentRank === null) {
        delta = -100; // Fell off rankings
      }

      rankChanges.push({
        keyword: kw.term,
        keywordId: kw.id,
        previousRank: prevRank,
        currentRank,
        delta,
      });
    }

    const significantMoves = rankChanges.filter((r) => Math.abs(r.delta) >= 5);

    // 6. Generate alerts
    const alerts: string[] = [];

    const bigDrops = significantMoves.filter((r) => r.delta <= -5);
    const bigGains = significantMoves.filter((r) => r.delta >= 5);

    if (bigDrops.length > 0) {
      alerts.push(
        `Rank dropped for ${bigDrops.length} keywords: ${bigDrops
          .slice(0, 5)
          .map((r) => `"${r.keyword}" ${r.previousRank}→${r.currentRank}`)
          .join(', ')}`,
      );
    }
    if (bigGains.length > 0) {
      alerts.push(
        `Rank improved for ${bigGains.length} keywords: ${bigGains
          .slice(0, 5)
          .map((r) => `"${r.keyword}" ${r.previousRank}→${r.currentRank}`)
          .join(', ')}`,
      );
    }

    const unranked = rankChanges.filter((r) => r.currentRank === null);
    if (unranked.length > trackedKeywords.length * 0.5) {
      alerts.push(`Warning: ${unranked.length}/${trackedKeywords.length} keywords have no rank. Check if package name is correct.`);
    }

    // 7. Log action
    actions.push({
      actionType: 'rank_tracking',
      reasoning: `Tracked ${rankChanges.length} keywords. ${significantMoves.length} significant moves (|delta| >= 5). ${bigDrops.length} drops, ${bigGains.length} gains.`,
      suggestedChange: alerts.length > 0 ? alerts[0]! : 'No significant changes.',
      authorityLevel: 'L0',
    });

    await this.logActions(actions, fullCtx);

    return {
      data: {
        appName: targetApp.name,
        date: today,
        keywordsTracked: rankChanges.length,
        rankChanges,
        significantMoves,
        competitorChanges: [],
        alerts,
      },
      actions,
      tokensUsed: this.getTokenUsage(),
    };
  }

  /**
   * Spy on competitor listings — snapshot and detect changes.
   * L0 — runs automatically.
   */
  async spyCompetitors(
    appId: string,
    _ctx: AgentContext = {},
  ): Promise<CompetitorChange[]> {
    // Get competitor apps (not ours, same platform)
    const [targetApp] = await db.select().from(apps).where(eq(apps.id, appId));
    if (!targetApp) return [];

    const competitors = await db
      .select()
      .from(apps)
      .where(
        and(
          eq(apps.isOurs, false),
          eq(apps.platform, targetApp.platform),
        ),
      );

    const changes: CompetitorChange[] = [];
    const today = new Date().toISOString().split('T')[0]!;

    for (const comp of competitors) {
      if (!comp.packageName) continue;

      // Fetch latest details
      try {
        const details = await this.playDetails.getAppDetails(comp.packageName);
        if (!details) continue;

        // Save snapshot
        await db.insert(listingSnapshots).values({
          appId: comp.id,
          title: details.title,
          subtitle: null,
          shortDesc: details.shortDescription,
          longDesc: details.description,
          iconUrl: details.icon,
          screenshotUrls: details.screenshots,
          videoUrl: details.video ?? null,
          rating: details.score,
          reviewCount: details.ratings,
          installsText: details.installs,
          version: details.version,
          appSize: null,
          snapshotDate: today,
        });

        // Detect changes against previous snapshot
        const result = await changeDetector.detectChanges(comp.id);
        if (result && result.changes.length > 0) {
          await changeDetector.detectAndLog(comp.id);
          changes.push({
            appId: comp.id,
            appName: comp.name,
            changes: result.changes,
          });
        }
      } catch {
        // Skip failed competitor scrapes
      }
    }

    return changes;
  }

  /**
   * Full tracking run: rank check + competitor spy.
   */
  async fullTrackingRun(
    appId: string,
    ctx: AgentContext = {},
  ): Promise<AgentResult<TrackingReport>> {
    const result = await this.trackRankings(appId, ctx);

    // Also spy on competitors
    const competitorChanges = await this.spyCompetitors(appId, ctx);
    result.data.competitorChanges = competitorChanges;

    // Add competitor change alerts
    for (const cc of competitorChanges) {
      const summary = cc.changes
        .map((c) => c.field)
        .join(', ');
      result.data.alerts.push(
        `Competitor "${cc.appName}" changed: ${summary}`,
      );
    }

    return result;
  }
}

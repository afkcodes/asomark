import { createQueue, createWorker } from '../lib/queue.js';
import { db } from '../db/index.js';
import { apps } from '../db/schema/apps.js';
import { projects, projectCompetitors, discoveredKeywords } from '../db/schema/projects.js';
import { rankSnapshots } from '../db/schema/rankings.js';
import { listingSnapshots } from '../db/schema/listings.js';
import { reviews } from '../db/schema/reviews.js';
import { keywords } from '../db/schema/keywords.js';
import { eq, and, desc } from 'drizzle-orm';
import { TrackerAgent } from '../agents/tracker.js';
import {
  PlayStoreSearchScraper,
  PlayStoreDetailsScraper,
  PlayStoreChartsScraper,
  PlayStoreReviewsScraper,
  type ChartCollection,
} from '../scrapers/playstore/index.js';
import { changeDetector } from '../lib/change-detector.js';
import { CorrelationEngine } from '../agents/correlation.js';
import { sendAlert, sendAlerts } from '../lib/notifications.js';
import { eventBus } from '../lib/events.js';

// ─── Queue ───

export const trackingQueue = createQueue('tracking');

// ─── Types ───

interface TrackingJobData {
  type: 'rank_check' | 'competitor_spy' | 'full_tracking' | 'category_rank' | 'project_rank_check' | 'project_full_tracking';
  appId?: string; // If omitted, tracks all "ours" apps
}

// ─── Worker ───

export const trackingWorker = createWorker<TrackingJobData>(
  'tracking',
  async (job) => {
    const { type, appId } = job.data;
    const tracker = new TrackerAgent();

    // Get apps to track
    let appIds: string[];
    if (appId) {
      appIds = [appId];
    } else {
      const ourApps = await db
        .select()
        .from(apps)
        .where(eq(apps.isOurs, true));
      appIds = ourApps.map((a) => a.id);
    }

    const allAlerts: string[] = [];

    // Project-aware rank check: track isTracking keywords per project
    if (type === 'project_rank_check') {
      const activeProjects = await db
        .select()
        .from(projects)
        .innerJoin(apps, eq(projects.appId, apps.id))
        .where(eq(projects.isActive, true));

      const searcher = new PlayStoreSearchScraper();

      for (const { projects: project, apps: projectApp } of activeProjects) {
        if (!projectApp.packageName) continue;

        const tracked = await db
          .select()
          .from(discoveredKeywords)
          .where(
            and(
              eq(discoveredKeywords.projectId, project.id),
              eq(discoveredKeywords.isTracking, true),
            ),
          );

        for (const kw of tracked) {
          try {
            const results = await searcher.search(kw.keyword, { country: project.region });
            const position = results.findIndex((r) => r.appId === projectApp.packageName);
            const newRank = position === -1 ? null : position + 1;

            // Update myRank
            await db
              .update(discoveredKeywords)
              .set({ myRank: newRank })
              .where(eq(discoveredKeywords.id, kw.id));

            // Also write to rank_snapshots for historical tracking
            let [kwEntry] = await db
              .select()
              .from(keywords)
              .where(eq(keywords.term, kw.keyword))
              .limit(1);
            if (!kwEntry) {
              [kwEntry] = await db
                .insert(keywords)
                .values({ term: kw.keyword, platform: 'android', region: project.region })
                .returning();
            }
            if (kwEntry) {
              await db.insert(rankSnapshots).values({
                appId: project.appId,
                keywordId: kwEntry.id,
                platform: 'android',
                region: project.region,
                rank: newRank,
                date: new Date().toISOString().split('T')[0]!,
              });
            }

            // Detect significant rank changes
            if (kw.myRank !== null && newRank !== null) {
              const delta = kw.myRank - newRank;
              if (Math.abs(delta) >= 5) {
                allAlerts.push(
                  `"${kw.keyword}": rank ${delta > 0 ? 'improved' : 'dropped'} ${Math.abs(delta)} positions (${kw.myRank} → ${newRank})`,
                );
              }
            }
          } catch {
            // Skip failed checks
          }
        }
        console.log(`[tracking] Project "${project.name}": checked ${tracked.length} tracked keywords`);
      }

      if (allAlerts.length > 0) {
        await sendAlerts(
          allAlerts.map((msg) => ({
            title: 'Rank Change Alert',
            message: msg,
            severity: msg.includes('dropped') ? 'warning' as const : 'info' as const,
            agent: 'tracker',
          })),
        );
      }
      return { projects: activeProjects.length, alerts: allAlerts.length };
    }

    // Project-aware full tracking: scrape competitor listings, detect changes, scrape reviews
    if (type === 'project_full_tracking') {
      const activeProjects = await db
        .select()
        .from(projects)
        .innerJoin(apps, eq(projects.appId, apps.id))
        .where(eq(projects.isActive, true));

      const detailsScraper = new PlayStoreDetailsScraper();
      const reviewScraper = new PlayStoreReviewsScraper();
      const today = new Date().toISOString().split('T')[0]!;
      let totalSnapshots = 0;
      let totalChanges = 0;
      let totalReviews = 0;

      for (const { projects: project, apps: projectApp } of activeProjects) {
        // Get competitors
        const comps = await db
          .select({ app: apps })
          .from(projectCompetitors)
          .innerJoin(apps, eq(projectCompetitors.competitorAppId, apps.id))
          .where(eq(projectCompetitors.projectId, project.id));

        // Scrape competitor listings
        for (const comp of comps) {
          if (!comp.app.packageName) continue;
          try {
            const details = await detailsScraper.getAppDetails(comp.app.packageName, 'en', project.region);
            if (!details) continue;

            await db.insert(listingSnapshots).values({
              appId: comp.app.id,
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
            totalSnapshots++;

            // Detect changes against previous snapshot
            const result = await changeDetector.detectChanges(comp.app.id);
            if (result && result.changes.length > 0) {
              await changeDetector.detectAndLog(comp.app.id);
              totalChanges += result.changes.length;

              for (const change of result.changes) {
                allAlerts.push(
                  `${comp.app.name}: ${change.field} ${change.changeType}`,
                );
                eventBus.emit('listing:change_detected', {
                  appId: comp.app.id,
                  field: change.field,
                  oldValue: change.oldValue,
                  newValue: change.newValue,
                });
              }

              // Run correlation analysis for this change
              try {
                const correlator = new CorrelationEngine();
                await correlator.analyze(comp.app.id);
              } catch {
                // Correlation analysis is best-effort
              }
            }
          } catch {
            // Skip failed competitor scrapes
          }
        }

        // Scrape reviews for our app (latest 50)
        if (projectApp.packageName) {
          try {
            const appReviews = await reviewScraper.getReviews(projectApp.packageName, {
              num: 50,
              lang: 'en',
              country: project.region,
            });
            for (const review of appReviews) {
              try {
                await db.insert(reviews).values({
                  appId: projectApp.id,
                  platform: 'android',
                  author: review.userName ?? null,
                  rating: review.score ?? null,
                  text: review.text ?? null,
                  date: review.date ? new Date(review.date).toISOString().split('T')[0]! : null,
                  language: 'en',
                });
                totalReviews++;
              } catch {
                // Skip duplicate reviews
              }
            }
          } catch {
            // Skip failed review scrapes
          }
        }
      }

      console.log(`[tracking] Full project tracking: ${totalSnapshots} snapshots, ${totalChanges} changes, ${totalReviews} new reviews`);

      if (allAlerts.length > 0) {
        await sendAlerts(
          allAlerts.map((msg) => ({
            title: 'Competitor Change',
            message: msg,
            severity: 'info' as const,
            agent: 'tracker',
          })),
        );
      }

      return { snapshots: totalSnapshots, changes: totalChanges, reviews: totalReviews, alerts: allAlerts.length };
    }

    for (const id of appIds) {
      try {
        if (type === 'rank_check') {
          const result = await tracker.trackRankings(id);
          allAlerts.push(...result.data.alerts);
        } else if (type === 'competitor_spy') {
          const changes = await tracker.spyCompetitors(id);
          for (const cc of changes) {
            allAlerts.push(
              `Competitor "${cc.appName}" changed: ${cc.changes.map((c) => c.field).join(', ')}`,
            );
          }
        } else if (type === 'category_rank') {
          await trackCategoryRanks(id, allAlerts);
        } else {
          const result = await tracker.fullTrackingRun(id);
          allAlerts.push(...result.data.alerts);
        }
      } catch (err) {
        allAlerts.push(
          `Tracking failed for app ${id}: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    }

    // Send alerts for significant changes
    if (allAlerts.length > 0) {
      await sendAlerts(
        allAlerts.map((msg) => ({
          title: 'Tracking Alert',
          message: msg,
          severity: msg.toLowerCase().includes('dropped') ? 'warning' as const : 'info' as const,
          agent: 'tracker',
        })),
      );
    }

    return { tracked: appIds.length, alerts: allAlerts.length };
  },
  { concurrency: 1 },
);

// ─── Category Rank Tracking ───

const chartsScraper = new PlayStoreChartsScraper();
const CHART_COLLECTIONS: ChartCollection[] = ['topselling_free', 'topgrossing'];

async function trackCategoryRanks(appId: string, alerts: string[]) {
  const [app] = await db.select().from(apps).where(eq(apps.id, appId));
  if (!app || !app.packageName || !app.category) return;

  for (const collection of CHART_COLLECTIONS) {
    try {
      const rank = await chartsScraper.getAppChartRank(
        app.packageName,
        app.category,
        collection,
      );

      if (rank !== null) {
        await db.insert(rankSnapshots).values({
          appId,
          platform: 'android',
          categoryRank: rank,
          date: new Date().toISOString().split('T')[0]!,
        });
        alerts.push(`${app.name}: #${rank} in ${app.category} ${collection}`);
      }
    } catch {
      // Chart scrape failed, skip silently
    }
  }
}

// ─── Schedulers ───

/**
 * Schedule recurring tracking jobs.
 * Call once at server startup.
 */
export async function scheduleTrackingJobs() {
  // Every 6 hours: rank check for all our apps
  await trackingQueue.upsertJobScheduler(
    'rank-check-6h',
    { pattern: '0 */6 * * *' },
    {
      name: 'rank-check',
      data: { type: 'rank_check' },
    },
  );

  // Every 24 hours at 3 AM: competitor spy
  await trackingQueue.upsertJobScheduler(
    'competitor-spy-daily',
    { pattern: '0 3 * * *' },
    {
      name: 'competitor-spy',
      data: { type: 'competitor_spy' },
    },
  );

  // Every 6 hours (offset by 1h): category rank tracking
  await trackingQueue.upsertJobScheduler(
    'category-rank-6h',
    { pattern: '0 1,7,13,19 * * *' },
    {
      name: 'category-rank',
      data: { type: 'category_rank' },
    },
  );

  // Every 12 hours: project-aware rank check for tracked keywords only
  await trackingQueue.upsertJobScheduler(
    'project-rank-check-12h',
    { pattern: '0 6,18 * * *' },
    {
      name: 'project-rank-check',
      data: { type: 'project_rank_check' },
    },
  );

  // Daily at 5 AM: full project tracking (competitor snapshots, change detection, reviews)
  await trackingQueue.upsertJobScheduler(
    'project-full-tracking-daily',
    { pattern: '0 5 * * *' },
    {
      name: 'project-full-tracking',
      data: { type: 'project_full_tracking' },
    },
  );
}

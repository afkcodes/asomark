import { createQueue, createWorker } from '../lib/queue.js';
import { db } from '../db/index.js';
import { apps } from '../db/schema/apps.js';
import { projects, discoveredKeywords } from '../db/schema/projects.js';
import { experiments } from '../db/schema/experiments.js';
import { healthScores } from '../db/schema/health.js';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { Brain } from '../agents/brain.js';
import { HealthScorer } from '../agents/health.js';
import { KeywordAgent } from '../agents/keyword.js';
import { KeywordDifficultyScorer } from '../lib/keyword-difficulty.js';
import { PlayStoreSearchScraper } from '../scrapers/playstore/index.js';
import { sendAlert, sendDailyBriefing } from '../lib/notifications.js';
import { eventBus } from '../lib/events.js';
import { TrackerAgent } from '../agents/tracker.js';

// ─── Queue ───

export const analysisQueue = createQueue('analysis');

// ─── Types ───

interface AnalysisJobData {
  type: 'daily_briefing' | 'keyword_scan' | 'health_check' | 'full_analysis' | 'difficulty_rescore';
  appId?: string;
  projectId?: string;
}

// ─── Worker ───

export const analysisWorker = createWorker<AnalysisJobData>(
  'analysis',
  async (job) => {
    const { type, appId } = job.data;

    // Get our apps
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

    switch (type) {
      case 'health_check': {
        const health = new HealthScorer();
        for (const id of appIds) {
          try {
            const result = await health.score(id);
            eventBus.emit('health:score_updated', {
              appId: id,
              score: result.data.overallScore,
              previousScore: null,
            });
            if (result.data.overallScore < 50) {
              await sendAlert({
                title: 'Low Health Score',
                message: `Health score: ${result.data.overallScore}/100 (${result.data.grade}). Top issue: ${result.data.topIssues[0] ?? 'none'}`,
                severity: 'warning',
                appName: result.data.appName,
                agent: 'health',
              });
            }
          } catch {
            // Skip failed health checks
          }
        }
        return { checked: appIds.length };
      }

      case 'keyword_scan': {
        const keyword = new KeywordAgent();
        for (const id of appIds) {
          try {
            await keyword.research(id);
          } catch {
            // Skip failed scans
          }
        }
        return { scanned: appIds.length };
      }

      case 'full_analysis': {
        const brain = new Brain();
        for (const id of appIds) {
          try {
            const result = await brain.fullAnalysis(id);
            await sendAlert({
              title: 'Full Analysis Complete',
              message: `Health: ${result.data.health?.overallScore ?? '?'}/100. ${result.data.keywords?.topKeywords.length ?? 0} keywords. Next steps: ${result.data.nextSteps.slice(0, 2).join('; ')}`,
              severity: 'info',
              agent: 'brain',
            });
          } catch {
            // Skip failed analyses
          }
        }
        return { analyzed: appIds.length };
      }

      case 'daily_briefing': {
        // Collect stats for briefing
        const ourApps = await db
          .select()
          .from(apps)
          .where(eq(apps.isOurs, true));

        const activeExps = await db
          .select({ count: sql<number>`count(*)` })
          .from(experiments)
          .where(inArray(experiments.status, ['running', 'monitoring']));

        // Get latest health score
        let latestHealth: number | null = null;
        if (ourApps[0]) {
          const [hs] = await db
            .select()
            .from(healthScores)
            .where(eq(healthScores.appId, ourApps[0].id))
            .orderBy(desc(healthScores.date))
            .limit(1);
          latestHealth = hs?.overallScore ?? null;
        }

        // Run tracking and collect alerts
        const tracker = new TrackerAgent();
        const allAlerts: string[] = [];
        let totalMoves = 0;
        let totalCompChanges = 0;
        let totalKeywords = 0;

        for (const app of ourApps) {
          try {
            const result = await tracker.fullTrackingRun(app.id);
            totalKeywords += result.data.keywordsTracked;
            totalMoves += result.data.significantMoves.length;
            totalCompChanges += result.data.competitorChanges.length;
            allAlerts.push(...result.data.alerts);
          } catch {
            // Skip
          }
        }

        await sendDailyBriefing({
          appsTracked: ourApps.length,
          keywordsTracked: totalKeywords,
          significantMoves: totalMoves,
          competitorChanges: totalCompChanges,
          activeExperiments: Number(activeExps[0]?.count ?? 0),
          healthScore: latestHealth,
          topAlerts: allAlerts,
        });

        return { briefingSent: true };
      }

      case 'difficulty_rescore': {
        // Re-score difficulty for all tracked keywords across active projects
        const scorer = new KeywordDifficultyScorer();
        const searcher = new PlayStoreSearchScraper();

        const activeProjects = await db
          .select()
          .from(projects)
          .where(eq(projects.isActive, true));

        let rescored = 0;
        for (const project of activeProjects) {
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
              const searchResults = await searcher.search(kw.keyword, { country: project.region });
              const result = scorer.scoreFast(kw.keyword, searchResults);
              await db
                .update(discoveredKeywords)
                .set({ difficulty: result.score })
                .where(eq(discoveredKeywords.id, kw.id));
              rescored++;
            } catch {
              // Skip failed rescores
            }
          }
        }

        console.log(`[analysis] Difficulty rescore: ${rescored} keywords across ${activeProjects.length} projects`);
        return { rescored, projects: activeProjects.length };
      }

      default:
        throw new Error(`Unknown analysis type: ${type}`);
    }
  },
  { concurrency: 1 },
);

// ─── Schedulers ───

export async function scheduleAnalysisJobs() {
  // Daily at 7 AM: daily briefing (includes tracking + alerts)
  await analysisQueue.upsertJobScheduler(
    'daily-briefing',
    { pattern: '0 7 * * *' },
    {
      name: 'daily-briefing',
      data: { type: 'daily_briefing' },
    },
  );

  // Daily at 2 AM: health check
  await analysisQueue.upsertJobScheduler(
    'health-check-daily',
    { pattern: '0 2 * * *' },
    {
      name: 'health-check',
      data: { type: 'health_check' },
    },
  );

  // Weekly Monday 4 AM: keyword scan
  await analysisQueue.upsertJobScheduler(
    'keyword-scan-weekly',
    { pattern: '0 4 * * 1' },
    {
      name: 'keyword-scan',
      data: { type: 'keyword_scan' },
    },
  );

  // Weekly Wednesday 3 AM: difficulty rescore for tracked keywords
  await analysisQueue.upsertJobScheduler(
    'difficulty-rescore-weekly',
    { pattern: '0 3 * * 3' },
    {
      name: 'difficulty-rescore',
      data: { type: 'difficulty_rescore' },
    },
  );
}

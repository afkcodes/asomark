/**
 * Data Retention Worker
 *
 * Prunes old data to keep the database lean:
 * - Roll up rank_snapshots older than 90 days (keep weekly instead of daily)
 * - Delete scrape_jobs older than 30 days
 * - Delete old listing_snapshots beyond 6 months (keep monthly)
 * - Prune completed BullMQ jobs
 */
import { createQueue, createWorker } from '../lib/queue.js';
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';

// ─── Queue ───

export const retentionQueue = createQueue('retention');

// ─── Types ───

interface RetentionJobData {
  type: 'daily_cleanup' | 'monthly_rollup';
}

// ─── Worker ───

export const retentionWorker = createWorker<RetentionJobData>(
  'retention',
  async (job) => {
    const { type } = job.data;
    const stats = { scrapeJobsDeleted: 0, snapshotsRolledUp: 0, rankSnapshotsRolledUp: 0 };

    if (type === 'daily_cleanup') {
      // Delete scrape_jobs older than 30 days
      const scrapeResult = await db.execute(sql`
        DELETE FROM scrape_jobs
        WHERE created_at < NOW() - INTERVAL '30 days'
      `);
      stats.scrapeJobsDeleted = Number(scrapeResult.count ?? 0);

      console.log(`[retention] Daily cleanup: ${stats.scrapeJobsDeleted} old scrape jobs deleted`);
    }

    if (type === 'monthly_rollup') {
      // Roll up rank_snapshots older than 90 days: keep only one per week per app/keyword
      // Delete duplicates, keeping the one closest to each Monday
      const rankResult = await db.execute(sql`
        DELETE FROM rank_snapshots
        WHERE id IN (
          SELECT id FROM (
            SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY app_id, keyword_id, DATE_TRUNC('week', date::timestamp)
                ORDER BY date
              ) AS rn
            FROM rank_snapshots
            WHERE date::timestamp < NOW() - INTERVAL '90 days'
          ) sub
          WHERE rn > 1
        )
      `);
      stats.rankSnapshotsRolledUp = Number(rankResult.count ?? 0);

      // Roll up listing_snapshots older than 6 months: keep one per month per app
      const snapResult = await db.execute(sql`
        DELETE FROM listing_snapshots
        WHERE id IN (
          SELECT id FROM (
            SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY app_id, DATE_TRUNC('month', snapshot_date::timestamp)
                ORDER BY snapshot_date DESC
              ) AS rn
            FROM listing_snapshots
            WHERE snapshot_date::timestamp < NOW() - INTERVAL '6 months'
          ) sub
          WHERE rn > 1
        )
      `);
      stats.snapshotsRolledUp = Number(snapResult.count ?? 0);

      console.log(
        `[retention] Monthly rollup: ${stats.rankSnapshotsRolledUp} rank snapshots, ${stats.snapshotsRolledUp} listing snapshots pruned`,
      );
    }

    return stats;
  },
  { concurrency: 1 },
);

// ─── Scheduling ───

export async function scheduleRetentionJobs() {
  // Daily cleanup at 4 AM
  await retentionQueue.upsertJobScheduler(
    'daily-cleanup',
    { pattern: '0 4 * * *' },
    { name: 'daily-cleanup', data: { type: 'daily_cleanup' } },
  );

  // Monthly rollup on the 1st at 3 AM
  await retentionQueue.upsertJobScheduler(
    'monthly-rollup',
    { pattern: '0 3 1 * *' },
    { name: 'monthly-rollup', data: { type: 'monthly_rollup' } },
  );
}

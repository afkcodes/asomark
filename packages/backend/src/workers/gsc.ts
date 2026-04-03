/**
 * Google Search Console daily sync worker.
 * Pulls search performance data for all connected projects.
 */
import { db } from '../db/index.js';
import { gscConnections } from '../db/schema/gsc.js';
import { syncGscData } from '../routes/gsc.js';
import { createQueue, createWorker } from '../lib/queue.js';

interface GscJobData {
  type: 'daily_sync';
}

export const gscQueue = createQueue('gsc');

export const gscWorker = createWorker<GscJobData>(
  'gsc',
  async (job) => {
    if (job.data.type !== 'daily_sync') return;

    console.log('[gsc-worker] Starting daily sync...');

    // Get all connected projects
    const connections = await db.select().from(gscConnections);

    if (connections.length === 0) {
      console.log('[gsc-worker] No GSC connections, skipping');
      return;
    }

    let totalSynced = 0;

    for (const conn of connections) {
      try {
        const result = await syncGscData(conn.projectId, { daysBack: 3 });
        totalSynced += result.synced;
        console.log(`[gsc-worker] Project ${conn.projectId}: synced ${result.synced} rows`);
      } catch (err) {
        console.error(`[gsc-worker] Project ${conn.projectId} failed:`, (err as Error).message);
      }

      // Small delay between projects to respect rate limits
      await new Promise((r) => setTimeout(r, 500));
    }

    console.log(`[gsc-worker] Daily sync complete: ${totalSynced} total rows across ${connections.length} projects`);
  },
  { concurrency: 1 },
);

export async function scheduleGscJobs() {
  await gscQueue.upsertJobScheduler(
    'gsc-daily-sync',
    { pattern: '0 7 * * *' }, // Daily at 7 AM UTC (after GSC data updates)
    {
      name: 'gsc-sync',
      data: { type: 'daily_sync' } as GscJobData,
    },
  );
}

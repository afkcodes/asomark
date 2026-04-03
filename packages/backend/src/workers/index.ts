import { trackingWorker, scheduleTrackingJobs } from './tracking.js';
import { analysisWorker, scheduleAnalysisJobs } from './analysis.js';
import { scrapingWorker } from './scraping.js';
import { experimentsWorker, scheduleExperimentJobs } from './experiments.js';
import { setupWorker } from './setup.js';
import { retentionWorker, scheduleRetentionJobs } from './retention.js';
import { gscWorker, scheduleGscJobs } from './gsc.js';

export { trackingQueue } from './tracking.js';
export { analysisQueue } from './analysis.js';
export { scrapingQueue } from './scraping.js';
export { experimentsQueue } from './experiments.js';
export { setupQueue } from './setup.js';
export { retentionQueue } from './retention.js';
export { gscQueue } from './gsc.js';

/**
 * Start all workers and schedule recurring jobs.
 * Call once at server startup.
 */
export async function startWorkers() {
  // Workers start automatically when imported, but we log them
  const workers = [
    { name: 'tracking', worker: trackingWorker },
    { name: 'analysis', worker: analysisWorker },
    { name: 'scraping', worker: scrapingWorker },
    { name: 'experiments', worker: experimentsWorker },
    { name: 'setup', worker: setupWorker },
    { name: 'retention', worker: retentionWorker },
    { name: 'gsc', worker: gscWorker },
  ];

  for (const { name, worker } of workers) {
    worker.on('completed', (job) => {
      console.log(`[worker:${name}] Job ${job.name} completed`);
    });
    worker.on('failed', (job, err) => {
      console.error(`[worker:${name}] Job ${job?.name} failed:`, err.message);
    });
  }

  // Schedule recurring jobs
  await scheduleTrackingJobs();
  await scheduleAnalysisJobs();
  await scheduleExperimentJobs();
  await scheduleRetentionJobs();
  await scheduleGscJobs();

  console.log('[workers] All workers started and jobs scheduled');
}

/**
 * Gracefully shut down all workers.
 */
export async function stopWorkers() {
  await Promise.all([
    trackingWorker.close(),
    analysisWorker.close(),
    scrapingWorker.close(),
    experimentsWorker.close(),
    setupWorker.close(),
    retentionWorker.close(),
    gscWorker.close(),
  ]);
  console.log('[workers] All workers stopped');
}

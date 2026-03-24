import { createQueue, createWorker } from '../lib/queue.js';
import { db } from '../db/index.js';
import { experiments } from '../db/schema/experiments.js';
import { apps } from '../db/schema/apps.js';
import { eq, inArray } from 'drizzle-orm';
import { ExperimentAgent } from '../agents/experiment.js';
import { sendAlert } from '../lib/notifications.js';

// ─── Queue ───

export const experimentsQueue = createQueue('experiments');

// ─── Types ───

interface ExperimentJobData {
  type: 'check_status' | 'plan_new';
  appId?: string;
  experimentId?: string;
}

// ─── Worker ───

export const experimentsWorker = createWorker<ExperimentJobData>(
  'experiments',
  async (job) => {
    const { type, appId, experimentId } = job.data;
    const agent = new ExperimentAgent();

    switch (type) {
      case 'check_status': {
        // Check all running experiments
        const running = await db
          .select()
          .from(experiments)
          .where(inArray(experiments.status, ['running', 'monitoring']));

        for (const exp of running) {
          // Check if experiment has been running long enough (minimum 7 days)
          if (exp.startedAt) {
            const daysRunning = Math.floor(
              (Date.now() - exp.startedAt.getTime()) / (1000 * 60 * 60 * 24),
            );

            if (daysRunning >= 7) {
              // Move to analyzing state
              await db
                .update(experiments)
                .set({ status: 'analyzing' })
                .where(eq(experiments.id, exp.id));

              // Get app name for notification
              const [app] = exp.appId
                ? await db.select().from(apps).where(eq(apps.id, exp.appId))
                : [];

              await sendAlert({
                title: 'Experiment Ready for Analysis',
                message: `${exp.type} experiment has been running for ${daysRunning} days. Review results and determine winner.`,
                severity: 'info',
                appName: app?.name,
                agent: 'experiment',
              });
            }
          }
        }

        return { checked: running.length };
      }

      case 'plan_new': {
        if (!appId) throw new Error('appId required for plan_new');

        const result = await agent.plan(appId);

        if (result.data.proposals.length > 0) {
          const [app] = await db.select().from(apps).where(eq(apps.id, appId));

          await sendAlert({
            title: 'New Experiment Proposals',
            message: `${result.data.proposals.length} experiments proposed: ${result.data.proposals.map((p) => `${p.type} (${p.priority})`).join(', ')}`,
            severity: 'info',
            appName: app?.name,
            agent: 'experiment',
          });
        }

        return { proposals: result.data.proposals.length };
      }

      default:
        throw new Error(`Unknown experiment job type: ${type}`);
    }
  },
  { concurrency: 1 },
);

// ─── Schedulers ───

export async function scheduleExperimentJobs() {
  // Daily at 8 AM: check experiment status
  await experimentsQueue.upsertJobScheduler(
    'experiment-status-daily',
    { pattern: '0 8 * * *' },
    {
      name: 'check-status',
      data: { type: 'check_status' },
    },
  );
}

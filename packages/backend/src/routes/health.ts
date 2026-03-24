import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { healthScores } from '../db/schema/health.js';

export async function healthRoutes(app: FastifyInstance) {
  // Get health score history for an app
  app.get('/api/apps/:appId/health', async (request) => {
    const { appId } = request.params as { appId: string };
    const rows = await db
      .select()
      .from(healthScores)
      .where(eq(healthScores.appId, appId))
      .orderBy(desc(healthScores.date));
    return { data: rows, meta: { total: rows.length } };
  });

  // Get latest health score for an app
  app.get('/api/apps/:appId/health/latest', async (request, reply) => {
    const { appId } = request.params as { appId: string };
    const [row] = await db
      .select()
      .from(healthScores)
      .where(eq(healthScores.appId, appId))
      .orderBy(desc(healthScores.date))
      .limit(1);

    if (!row) return reply.code(404).send({ error: 'No health scores found' });
    return row;
  });

  // Create health score (used by Health Scorer agent)
  app.post('/api/health', async (request, reply) => {
    const body = request.body as {
      appId: string;
      overallScore: number;
      breakdownJson?: unknown;
      date?: string;
    };

    const [row] = await db.insert(healthScores).values(body).returning();
    return reply.code(201).send(row);
  });
}

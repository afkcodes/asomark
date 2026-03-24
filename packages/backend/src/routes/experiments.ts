import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { experiments, experimentChanges } from '../db/schema/experiments.js';

export async function experimentsRoutes(app: FastifyInstance) {
  // List experiments
  app.get('/api/experiments', async (request) => {
    const { appId, status } = request.query as {
      appId?: string;
      status?: string;
    };

    let query = db.select().from(experiments).$dynamic();

    if (appId) {
      query = query.where(eq(experiments.appId, appId));
    }
    if (status) {
      query = query.where(eq(experiments.status, status as typeof experiments.status.enumValues[number]));
    }

    const rows = await query;
    return { data: rows, meta: { total: rows.length } };
  });

  // Get single experiment
  app.get('/api/experiments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db.select().from(experiments).where(eq(experiments.id, id));
    if (!row) return reply.code(404).send({ error: 'Experiment not found' });
    return row;
  });

  // Create experiment
  app.post('/api/experiments', async (request, reply) => {
    const body = request.body as {
      appId: string;
      platform: 'android' | 'ios';
      type: string;
      status?: string;
      variantsJson?: unknown;
    };

    const [row] = await db
      .insert(experiments)
      .values({
        appId: body.appId,
        platform: body.platform,
        type: body.type,
        status: (body.status as 'planning') ?? 'planning',
        variantsJson: body.variantsJson,
      })
      .returning();

    return reply.code(201).send(row);
  });

  // Update experiment
  app.patch('/api/experiments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{
      status: string;
      variantsJson: unknown;
      resultsJson: unknown;
      winner: string;
      applied: boolean;
      confidence: number;
      startedAt: string;
      endedAt: string;
    }>;

    const values: Record<string, unknown> = { ...body };
    if (body.startedAt) values.startedAt = new Date(body.startedAt);
    if (body.endedAt) values.endedAt = new Date(body.endedAt);

    const [row] = await db
      .update(experiments)
      .set(values)
      .where(eq(experiments.id, id))
      .returning();

    if (!row) return reply.code(404).send({ error: 'Experiment not found' });
    return row;
  });

  // Delete experiment
  app.delete('/api/experiments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    // Delete changes first (FK constraint)
    await db.delete(experimentChanges).where(eq(experimentChanges.experimentId, id));
    const [row] = await db.delete(experiments).where(eq(experiments.id, id)).returning();
    if (!row) return reply.code(404).send({ error: 'Experiment not found' });
    return reply.code(204).send();
  });

  // List changes for an experiment
  app.get('/api/experiments/:id/changes', async (request) => {
    const { id } = request.params as { id: string };
    const rows = await db
      .select()
      .from(experimentChanges)
      .where(eq(experimentChanges.experimentId, id));
    return { data: rows, meta: { total: rows.length } };
  });

  // Add a change to an experiment
  app.post('/api/experiments/:id/changes', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      fieldChanged: string;
      oldValue?: string;
      newValue?: string;
      changeDate?: string;
      impactMetricsJson?: unknown;
    };

    const [row] = await db
      .insert(experimentChanges)
      .values({
        experimentId: id,
        fieldChanged: body.fieldChanged,
        oldValue: body.oldValue,
        newValue: body.newValue,
        changeDate: body.changeDate,
        impactMetricsJson: body.impactMetricsJson,
      })
      .returning();

    return reply.code(201).send(row);
  });
}

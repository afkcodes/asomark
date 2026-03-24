import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { strategyLog } from '../db/schema/strategy.js';

export async function strategyRoutes(app: FastifyInstance) {
  // List strategy entries
  app.get('/api/strategy', async (request) => {
    const { appId, status, authorityLevel } = request.query as {
      appId?: string;
      status?: string;
      authorityLevel?: string;
    };

    let query = db.select().from(strategyLog).orderBy(desc(strategyLog.createdAt)).$dynamic();

    if (appId) {
      query = query.where(eq(strategyLog.appId, appId));
    }
    if (status) {
      query = query.where(eq(strategyLog.status, status));
    }
    if (authorityLevel) {
      query = query.where(eq(strategyLog.authorityLevel, authorityLevel as 'L0' | 'L1' | 'L2' | 'L3'));
    }

    const rows = await query;
    return { data: rows, meta: { total: rows.length } };
  });

  // Get single strategy entry
  app.get('/api/strategy/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db.select().from(strategyLog).where(eq(strategyLog.id, id));
    if (!row) return reply.code(404).send({ error: 'Strategy entry not found' });
    return row;
  });

  // Create strategy entry (used by AI agents)
  app.post('/api/strategy', async (request, reply) => {
    const body = request.body as {
      appId: string;
      actionType: string;
      reasoning: string;
      suggestedChange: string;
      authorityLevel: 'L0' | 'L1' | 'L2' | 'L3';
      status?: string;
    };

    const [row] = await db
      .insert(strategyLog)
      .values({
        ...body,
        status: body.status ?? 'pending',
        createdAt: new Date(),
      })
      .returning();

    return reply.code(201).send(row);
  });

  // Approve strategy entry
  app.post('/api/strategy/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [row] = await db
      .update(strategyLog)
      .set({ status: 'approved', approvedAt: new Date() })
      .where(eq(strategyLog.id, id))
      .returning();

    if (!row) return reply.code(404).send({ error: 'Strategy entry not found' });
    return row;
  });

  // Reject strategy entry
  app.post('/api/strategy/:id/reject', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [row] = await db
      .update(strategyLog)
      .set({ status: 'rejected' })
      .where(eq(strategyLog.id, id))
      .returning();

    if (!row) return reply.code(404).send({ error: 'Strategy entry not found' });
    return row;
  });

  // Mark strategy entry as executed
  app.post('/api/strategy/:id/execute', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [row] = await db
      .update(strategyLog)
      .set({ status: 'executed', executedAt: new Date() })
      .where(eq(strategyLog.id, id))
      .returning();

    if (!row) return reply.code(404).send({ error: 'Strategy entry not found' });
    return row;
  });
}

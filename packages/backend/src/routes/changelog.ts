import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { changeLog, rankCorrelations } from '../db/schema/changelog.js';

export async function changelogRoutes(app: FastifyInstance) {
  // List change log entries for an app
  app.get('/api/apps/:appId/changelog', async (request) => {
    const { appId } = request.params as { appId: string };
    const rows = await db
      .select()
      .from(changeLog)
      .where(eq(changeLog.appId, appId))
      .orderBy(desc(changeLog.timestamp));
    return { data: rows, meta: { total: rows.length } };
  });

  // Create change log entry (used by Tracker Agent)
  app.post('/api/changelog', async (request, reply) => {
    const body = request.body as {
      appId: string;
      changeType: string;
      field?: string;
      oldValue?: string;
      newValue?: string;
      source?: string;
      metadataJson?: unknown;
    };

    const [row] = await db
      .insert(changeLog)
      .values({ ...body, timestamp: new Date() })
      .returning();

    return reply.code(201).send(row);
  });

  // Get correlations for a change log entry
  app.get('/api/changelog/:changeId/correlations', async (request) => {
    const { changeId } = request.params as { changeId: string };
    const rows = await db
      .select()
      .from(rankCorrelations)
      .where(eq(rankCorrelations.changeLogId, changeId));
    return { data: rows, meta: { total: rows.length } };
  });

  // Create rank correlation (used by Correlation Engine)
  app.post('/api/correlations', async (request, reply) => {
    const body = request.body as {
      changeLogId: string;
      keywordId: string;
      rankBefore?: number;
      rankAfter?: number;
      cvrBefore?: number;
      cvrAfter?: number;
      daysToEffect?: number;
      confidence?: number;
      notes?: string;
    };

    const [row] = await db.insert(rankCorrelations).values(body).returning();
    return reply.code(201).send(row);
  });
}

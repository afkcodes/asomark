import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { keywordOpportunities } from '../db/schema/opportunities.js';

export async function opportunitiesRoutes(app: FastifyInstance) {
  // List opportunities for an app
  app.get('/api/apps/:appId/opportunities', async (request) => {
    const { appId } = request.params as { appId: string };
    const rows = await db
      .select()
      .from(keywordOpportunities)
      .where(eq(keywordOpportunities.appId, appId))
      .orderBy(desc(keywordOpportunities.opportunityScore));
    return { data: rows, meta: { total: rows.length } };
  });

  // Create opportunity (used by Keyword Agent)
  app.post('/api/opportunities', async (request, reply) => {
    const body = request.body as {
      keywordId: string;
      appId: string;
      currentRank?: number;
      potentialRank?: number;
      opportunityScore: number;
      suggestedAction?: string;
    };

    const [row] = await db
      .insert(keywordOpportunities)
      .values({ ...body, createdAt: new Date() })
      .returning();

    return reply.code(201).send(row);
  });

  // Bulk create opportunities
  app.post('/api/opportunities/bulk', async (request, reply) => {
    const body = request.body as Array<{
      keywordId: string;
      appId: string;
      currentRank?: number;
      potentialRank?: number;
      opportunityScore: number;
      suggestedAction?: string;
    }>;

    const values = body.map((b) => ({ ...b, createdAt: new Date() }));
    const rows = await db.insert(keywordOpportunities).values(values).returning();
    return reply.code(201).send(rows);
  });
}

import type { FastifyInstance } from 'fastify';
import { eq, and, between, desc, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { rankSnapshots } from '../db/schema/rankings.js';
import { keywords } from '../db/schema/keywords.js';

export async function rankingsRoutes(app: FastifyInstance) {
  // List rank snapshots with filters
  app.get('/api/rankings', async (request) => {
    const { appId, keywordId, from, to } = request.query as {
      appId?: string;
      keywordId?: string;
      from?: string;
      to?: string;
    };

    let query = db
      .select({
        id: rankSnapshots.id,
        appId: rankSnapshots.appId,
        keywordId: rankSnapshots.keywordId,
        keywordTerm: keywords.term,
        platform: rankSnapshots.platform,
        region: rankSnapshots.region,
        rank: rankSnapshots.rank,
        date: rankSnapshots.date,
        categoryRank: rankSnapshots.categoryRank,
      })
      .from(rankSnapshots)
      .leftJoin(keywords, eq(rankSnapshots.keywordId, keywords.id))
      .orderBy(desc(rankSnapshots.date))
      .$dynamic();

    if (appId) {
      query = query.where(eq(rankSnapshots.appId, appId));
    }
    if (keywordId) {
      query = query.where(eq(rankSnapshots.keywordId, keywordId));
    }
    if (from && to) {
      query = query.where(between(rankSnapshots.date, from, to));
    }

    const rows = await query;
    return { data: rows, meta: { total: rows.length } };
  });

  // Get rankings for a specific app
  app.get('/api/apps/:appId/rankings', async (request) => {
    const { appId } = request.params as { appId: string };
    const rows = await db
      .select({
        id: rankSnapshots.id,
        appId: rankSnapshots.appId,
        keywordId: rankSnapshots.keywordId,
        keywordTerm: keywords.term,
        platform: rankSnapshots.platform,
        region: rankSnapshots.region,
        rank: rankSnapshots.rank,
        date: rankSnapshots.date,
        categoryRank: rankSnapshots.categoryRank,
      })
      .from(rankSnapshots)
      .leftJoin(keywords, eq(rankSnapshots.keywordId, keywords.id))
      .where(eq(rankSnapshots.appId, appId))
      .orderBy(desc(rankSnapshots.date));
    return { data: rows, meta: { total: rows.length } };
  });

  // Create rank snapshot
  app.post('/api/rankings', async (request, reply) => {
    const body = request.body as {
      appId: string;
      keywordId: string;
      platform: 'android' | 'ios';
      rank: number;
      date: string;
      categoryRank?: number;
    };

    const [row] = await db.insert(rankSnapshots).values(body).returning();
    return reply.code(201).send(row);
  });

  // Bulk create rank snapshots (used by tracker worker)
  app.post('/api/rankings/bulk', async (request, reply) => {
    const body = request.body as Array<{
      appId: string;
      keywordId: string;
      platform: 'android' | 'ios';
      rank: number;
      date: string;
      categoryRank?: number;
    }>;

    const rows = await db.insert(rankSnapshots).values(body).returning();
    return reply.code(201).send(rows);
  });

  // Category rank history for an app
  app.get('/api/apps/:appId/category-ranks', async (request) => {
    const { appId } = request.params as { appId: string };
    const { from, to } = request.query as { from?: string; to?: string };

    let query = db
      .select()
      .from(rankSnapshots)
      .where(
        and(
          eq(rankSnapshots.appId, appId),
          isNotNull(rankSnapshots.categoryRank),
        ),
      )
      .orderBy(desc(rankSnapshots.date))
      .$dynamic();

    if (from && to) {
      query = query.where(
        and(
          eq(rankSnapshots.appId, appId),
          isNotNull(rankSnapshots.categoryRank),
          between(rankSnapshots.date, from, to),
        ),
      );
    }

    const rows = await query;
    return { data: rows, meta: { total: rows.length } };
  });
}

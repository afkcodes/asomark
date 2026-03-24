import type { FastifyInstance } from 'fastify';
import { eq, ilike, between, desc, and, isNotNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { keywords } from '../db/schema/keywords.js';
import {
  keywordSnapshots,
  keywordRelatedQueries,
  keywordSuggestHistory,
} from '../db/schema/keyword-intelligence.js';

export async function keywordsRoutes(app: FastifyInstance) {
  // List keywords
  app.get('/api/keywords', async (request) => {
    const { platform, search } = request.query as {
      platform?: string;
      search?: string;
    };

    let query = db.select().from(keywords).$dynamic();

    if (platform === 'android' || platform === 'ios') {
      query = query.where(eq(keywords.platform, platform));
    }
    if (search) {
      query = query.where(ilike(keywords.term, `%${search}%`));
    }

    const rows = await query;
    return { data: rows, meta: { total: rows.length } };
  });

  // Get single keyword
  app.get('/api/keywords/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db.select().from(keywords).where(eq(keywords.id, id));
    if (!row) return reply.code(404).send({ error: 'Keyword not found' });
    return row;
  });

  // Create keyword
  app.post('/api/keywords', async (request, reply) => {
    const body = request.body as {
      term: string;
      platform?: 'android' | 'ios';
      searchVolumeEst?: number;
      difficultyEst?: number;
    };

    const [row] = await db
      .insert(keywords)
      .values({
        term: body.term,
        platform: body.platform,
        searchVolumeEst: body.searchVolumeEst,
        difficultyEst: body.difficultyEst,
      })
      .returning();

    return reply.code(201).send(row);
  });

  // Bulk create keywords
  app.post('/api/keywords/bulk', async (request, reply) => {
    const body = request.body as Array<{
      term: string;
      platform?: 'android' | 'ios';
      searchVolumeEst?: number;
      difficultyEst?: number;
    }>;

    const rows = await db.insert(keywords).values(body).returning();
    return reply.code(201).send(rows);
  });

  // Update keyword
  app.patch('/api/keywords/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{
      term: string;
      platform: 'android' | 'ios';
      searchVolumeEst: number;
      difficultyEst: number;
    }>;

    const [row] = await db
      .update(keywords)
      .set({ ...body, lastUpdated: new Date() })
      .where(eq(keywords.id, id))
      .returning();

    if (!row) return reply.code(404).send({ error: 'Keyword not found' });
    return row;
  });

  // Delete keyword
  app.delete('/api/keywords/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db.delete(keywords).where(eq(keywords.id, id)).returning();
    if (!row) return reply.code(404).send({ error: 'Keyword not found' });
    return reply.code(204).send();
  });

  // ─── Keyword Intelligence Routes ───

  // Historical snapshots for a keyword
  app.get('/api/keywords/:id/history', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };

    let query = db
      .select()
      .from(keywordSnapshots)
      .where(eq(keywordSnapshots.keywordId, id))
      .orderBy(desc(keywordSnapshots.snapshotDate))
      .$dynamic();

    if (from && to) {
      query = query.where(
        and(
          eq(keywordSnapshots.keywordId, id),
          between(keywordSnapshots.snapshotDate, from, to),
        ),
      );
    }

    const rows = await query;
    return { data: rows, meta: { total: rows.length } };
  });

  // Autocomplete position history for a keyword
  app.get('/api/keywords/:id/suggest-history', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [kw] = await db.select().from(keywords).where(eq(keywords.id, id));
    if (!kw) return reply.code(404).send({ error: 'Keyword not found' });

    const rows = await db
      .select()
      .from(keywordSuggestHistory)
      .where(eq(keywordSuggestHistory.parentKeyword, kw.term))
      .orderBy(desc(keywordSuggestHistory.snapshotDate));

    return { data: rows, meta: { total: rows.length } };
  });

  // Related query evolution for a keyword
  app.get('/api/keywords/:id/related-queries', async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db
      .select({
        id: keywordRelatedQueries.id,
        relatedQuery: keywordRelatedQueries.relatedQuery,
        category: keywordRelatedQueries.category,
        value: keywordRelatedQueries.value,
        position: keywordRelatedQueries.position,
        snapshotDate: keywordRelatedQueries.snapshotDate,
      })
      .from(keywordRelatedQueries)
      .innerJoin(keywordSnapshots, eq(keywordRelatedQueries.keywordSnapshotId, keywordSnapshots.id))
      .where(eq(keywordSnapshots.keywordId, id))
      .orderBy(desc(keywordRelatedQueries.snapshotDate));

    return { data: rows, meta: { total: rows.length } };
  });

  // Trending keywords — fastest-rising suggest positions
  app.get('/api/keywords/trending', async () => {
    const rows = await db
      .select({
        parentKeyword: keywordSuggestHistory.parentKeyword,
        suggestedKeyword: keywordSuggestHistory.suggestedKeyword,
        source: keywordSuggestHistory.source,
        position: keywordSuggestHistory.position,
        region: keywordSuggestHistory.region,
        snapshotDate: keywordSuggestHistory.snapshotDate,
      })
      .from(keywordSuggestHistory)
      .where(isNotNull(keywordSuggestHistory.position))
      .orderBy(desc(keywordSuggestHistory.snapshotDate))
      .limit(100);

    return { data: rows, meta: { total: rows.length } };
  });
}

import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { reviews } from '../db/schema/reviews.js';

export async function reviewsRoutes(app: FastifyInstance) {
  // List reviews for an app
  app.get('/api/apps/:appId/reviews', async (request) => {
    const { appId } = request.params as { appId: string };
    const { rating } = request.query as { rating?: string };

    let query = db
      .select()
      .from(reviews)
      .where(eq(reviews.appId, appId))
      .orderBy(desc(reviews.date))
      .$dynamic();

    if (rating) {
      query = query.where(eq(reviews.rating, parseInt(rating, 10)));
    }

    const rows = await query;
    return { data: rows, meta: { total: rows.length } };
  });

  // Create review
  app.post('/api/reviews', async (request, reply) => {
    const body = request.body as {
      appId: string;
      platform: 'android' | 'ios';
      author?: string;
      rating: number;
      text?: string;
      date?: string;
      sentimentScore?: number;
      topicsJson?: unknown;
      language?: string;
    };

    const [row] = await db.insert(reviews).values(body).returning();
    return reply.code(201).send(row);
  });

  // Bulk create reviews (used by scraper)
  app.post('/api/reviews/bulk', async (request, reply) => {
    const body = request.body as Array<{
      appId: string;
      platform: 'android' | 'ios';
      author?: string;
      rating: number;
      text?: string;
      date?: string;
      sentimentScore?: number;
      topicsJson?: unknown;
      language?: string;
    }>;

    const rows = await db.insert(reviews).values(body).returning();
    return reply.code(201).send(rows);
  });
}

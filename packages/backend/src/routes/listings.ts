import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { listingSnapshots } from '../db/schema/listings.js';

export async function listingsRoutes(app: FastifyInstance) {
  // List snapshots for an app
  app.get('/api/apps/:appId/listings', async (request) => {
    const { appId } = request.params as { appId: string };
    const rows = await db
      .select()
      .from(listingSnapshots)
      .where(eq(listingSnapshots.appId, appId))
      .orderBy(desc(listingSnapshots.snapshotDate));
    return { data: rows, meta: { total: rows.length } };
  });

  // Get latest listing snapshot for an app
  app.get('/api/apps/:appId/listings/latest', async (request, reply) => {
    const { appId } = request.params as { appId: string };
    const [row] = await db
      .select()
      .from(listingSnapshots)
      .where(eq(listingSnapshots.appId, appId))
      .orderBy(desc(listingSnapshots.snapshotDate))
      .limit(1);

    if (!row) return reply.code(404).send({ error: 'No listing snapshots found' });
    return row;
  });

  // Create listing snapshot
  app.post('/api/listings', async (request, reply) => {
    const body = request.body as {
      appId: string;
      title?: string;
      subtitle?: string;
      shortDesc?: string;
      longDesc?: string;
      iconUrl?: string;
      screenshotUrls?: unknown;
      videoUrl?: string;
      rating?: number;
      reviewCount?: number;
      installsText?: string;
      version?: string;
      appSize?: string;
      snapshotDate?: string;
      diffFromPrevious?: string;
    };

    const [row] = await db.insert(listingSnapshots).values(body).returning();
    return reply.code(201).send(row);
  });
}

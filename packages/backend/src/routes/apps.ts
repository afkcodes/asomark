import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apps } from '../db/schema/apps.js';

export async function appsRoutes(app: FastifyInstance) {
  // List all apps
  app.get('/api/apps', async (request) => {
    const { platform, isOurs } = request.query as {
      platform?: string;
      isOurs?: string;
    };

    let query = db.select().from(apps).$dynamic();

    if (platform === 'android' || platform === 'ios') {
      query = query.where(eq(apps.platform, platform));
    }
    if (isOurs === 'true') {
      query = query.where(eq(apps.isOurs, true));
    }
    if (isOurs === 'false') {
      query = query.where(eq(apps.isOurs, false));
    }

    const rows = await query;
    return { data: rows, meta: { total: rows.length } };
  });

  // Get single app
  app.get('/api/apps/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db.select().from(apps).where(eq(apps.id, id));
    if (!row) return reply.code(404).send({ error: 'App not found' });
    return row;
  });

  // Create app
  app.post('/api/apps', async (request, reply) => {
    const body = request.body as {
      name: string;
      platform: 'android' | 'ios';
      packageName?: string;
      bundleId?: string;
      isOurs?: boolean;
      category?: string;
    };

    const [row] = await db
      .insert(apps)
      .values({
        name: body.name,
        platform: body.platform,
        packageName: body.packageName,
        bundleId: body.bundleId,
        isOurs: body.isOurs ?? false,
        category: body.category,
      })
      .returning();

    return reply.code(201).send(row);
  });

  // Update app
  app.patch('/api/apps/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{
      name: string;
      platform: 'android' | 'ios';
      packageName: string;
      bundleId: string;
      isOurs: boolean;
      category: string;
    }>;

    const [row] = await db
      .update(apps)
      .set(body)
      .where(eq(apps.id, id))
      .returning();

    if (!row) return reply.code(404).send({ error: 'App not found' });
    return row;
  });

  // Delete app
  app.delete('/api/apps/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db.delete(apps).where(eq(apps.id, id)).returning();
    if (!row) return reply.code(404).send({ error: 'App not found' });
    return reply.code(204).send();
  });
}

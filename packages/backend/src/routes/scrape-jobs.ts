import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { scrapeJobs } from '../db/schema/scrape-jobs.js';

export async function scrapeJobsRoutes(app: FastifyInstance) {
  // List scrape jobs
  app.get('/api/scrape-jobs', async (request) => {
    const { status } = request.query as { status?: string };

    let query = db.select().from(scrapeJobs).orderBy(desc(scrapeJobs.startedAt)).$dynamic();

    if (status) {
      query = query.where(eq(scrapeJobs.status, status));
    }

    const rows = await query;
    return { data: rows, meta: { total: rows.length } };
  });

  // Get single scrape job
  app.get('/api/scrape-jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, id));
    if (!row) return reply.code(404).send({ error: 'Scrape job not found' });
    return row;
  });

  // Create scrape job
  app.post('/api/scrape-jobs', async (request, reply) => {
    const body = request.body as {
      source: string;
      target: string;
    };

    const [row] = await db
      .insert(scrapeJobs)
      .values({
        source: body.source,
        target: body.target,
        status: 'pending',
        startedAt: new Date(),
      })
      .returning();

    return reply.code(201).send(row);
  });

  // Update scrape job status (used by workers)
  app.patch('/api/scrape-jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{
      status: string;
      recordsScraped: number;
      errors: string;
      completedAt: string;
    }>;

    const values: Record<string, unknown> = { ...body };
    if (body.completedAt) values.completedAt = new Date(body.completedAt);

    const [row] = await db
      .update(scrapeJobs)
      .set(values)
      .where(eq(scrapeJobs.id, id))
      .returning();

    if (!row) return reply.code(404).send({ error: 'Scrape job not found' });
    return row;
  });
}

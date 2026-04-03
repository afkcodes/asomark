import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { projects } from '../db/schema/projects.js';
import { siteAudits, siteAuditPages } from '../db/schema/site-audit.js';
import { SiteCrawler } from '../lib/site-crawler.js';

export async function siteAuditRoutes(app: FastifyInstance) {
  /** Start a new site audit */
  app.post('/api/projects/:id/site-audit', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { url?: string };

    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const siteUrl = body.url;
    if (!siteUrl) return reply.status(400).send({ error: 'url is required' });

    // Create audit record
    const [audit] = await db
      .insert(siteAudits)
      .values({ projectId: id, siteUrl, status: 'running' })
      .returning();

    // Run crawler (async — don't await, return immediately)
    const auditId = audit!.id;

    // Run in background
    (async () => {
      try {
        const crawler = new SiteCrawler({ maxPages: 50, delayMs: 500 });
        const results = await crawler.crawl(siteUrl);

        // Save page results
        for (const page of results) {
          await db.insert(siteAuditPages).values({
            auditId,
            url: page.url,
            statusCode: page.statusCode,
            loadTimeMs: page.loadTimeMs,
            title: page.title,
            titleLength: page.titleLength,
            metaDescription: page.metaDescription,
            metaDescriptionLength: page.metaDescriptionLength,
            h1Count: page.h1Count,
            h1Text: page.h1Text,
            imageCount: page.imageCount,
            imagesWithoutAlt: page.imagesWithoutAlt,
            internalLinks: page.internalLinks,
            externalLinks: page.externalLinks,
            brokenLinks: page.brokenLinks,
            wordCount: page.wordCount,
            hasCanonical: page.hasCanonical ? 1 : 0,
            canonicalUrl: page.canonicalUrl,
            hasRobotsMeta: page.hasRobotsMeta ? 1 : 0,
            schemaTypes: page.schemaTypes,
            issues: page.issues,
            score: page.score,
          });
        }

        // Calculate overall score and summary
        const allIssues = results.flatMap((r) => r.issues);
        const critical = allIssues.filter((i) => i.type === 'critical').length;
        const warning = allIssues.filter((i) => i.type === 'warning').length;
        const info = allIssues.filter((i) => i.type === 'info').length;
        const passed = results.filter((r) => r.issues.length === 0).length;
        const avgScore = results.length > 0
          ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
          : 0;

        await db
          .update(siteAudits)
          .set({
            status: 'completed',
            pagesCrawled: results.length,
            issuesFound: allIssues.length,
            score: avgScore,
            summary: { critical, warning, info, passed },
            completedAt: new Date(),
          })
          .where(eq(siteAudits.id, auditId));

        console.log(`[site-audit] Completed: ${results.length} pages, ${allIssues.length} issues, score ${avgScore}`);
      } catch (err) {
        await db
          .update(siteAudits)
          .set({ status: 'failed', completedAt: new Date() })
          .where(eq(siteAudits.id, auditId));
        console.error('[site-audit] Failed:', (err as Error).message);
      }
    })();

    return { id: auditId, status: 'running', message: 'Audit started — crawling your website...' };
  });

  /** Get latest audit for a project */
  app.get('/api/projects/:id/site-audit/latest', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [audit] = await db
      .select()
      .from(siteAudits)
      .where(eq(siteAudits.projectId, id))
      .orderBy(desc(siteAudits.startedAt))
      .limit(1);

    if (!audit) return { audit: null, pages: [] };

    const pages = await db
      .select()
      .from(siteAuditPages)
      .where(eq(siteAuditPages.auditId, audit.id));

    return { audit, pages };
  });

  /** List all audits for a project */
  app.get('/api/projects/:id/site-audit/history', async (request) => {
    const { id } = request.params as { id: string };

    const audits = await db
      .select()
      .from(siteAudits)
      .where(eq(siteAudits.projectId, id))
      .orderBy(desc(siteAudits.startedAt))
      .limit(20);

    return { data: audits };
  });

  /** Delete an audit */
  app.delete('/api/projects/:id/site-audit/:auditId', async (request) => {
    const { auditId } = request.params as { id: string; auditId: string };
    await db.delete(siteAudits).where(eq(siteAudits.id, auditId));
    return { success: true };
  });
}

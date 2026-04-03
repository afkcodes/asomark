/**
 * Google Search Console API routes.
 *
 * OAuth2 flow: user clicks "Connect" → redirect to Google → callback stores tokens.
 * Data endpoints: query stored performance data pulled by the daily worker.
 */
import type { FastifyInstance } from 'fastify';
import { google } from 'googleapis';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { projects } from '../db/schema/projects.js';
import { gscConnections, gscSearchPerformance } from '../db/schema/gsc.js';
import { seoKeywords } from '../db/schema/seo.js';
import { env } from '../config/env.js';

// ─── OAuth2 Helpers ───

function getOAuth2Client(redirectUri?: string) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set');
  }
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );
}

/** Get an authenticated OAuth2 client for a project, refreshing token if needed */
async function getAuthenticatedClient(projectId: string) {
  const [conn] = await db
    .select()
    .from(gscConnections)
    .where(eq(gscConnections.projectId, projectId));

  if (!conn) throw new Error('GSC not connected for this project');

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({
    access_token: conn.accessToken,
    refresh_token: conn.refreshToken,
    expiry_date: conn.tokenExpiresAt.getTime(),
  });

  // Refresh if expired (or within 5 min of expiry)
  if (conn.tokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
    const { credentials } = await oauth2.refreshAccessToken();
    await db
      .update(gscConnections)
      .set({
        accessToken: credentials.access_token!,
        tokenExpiresAt: new Date(credentials.expiry_date!),
      })
      .where(eq(gscConnections.projectId, projectId));
    oauth2.setCredentials(credentials);
  }

  return { oauth2, siteUrl: conn.siteUrl };
}

// ─── Sync Logic (shared between route and worker) ───

export async function syncGscData(
  projectId: string,
  opts: { daysBack?: number } = {},
) {
  const { daysBack = 3 } = opts;

  const { oauth2, siteUrl } = await getAuthenticatedClient(projectId);
  const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2 });

  // Date range: GSC data is 2-3 days behind
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 2);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - daysBack);

  const formatDate = (d: Date) => d.toISOString().split('T')[0]!;

  const response = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      dimensions: ['query', 'page', 'date'],
      rowLimit: 25000,
    },
  });

  const rows = response.data.rows ?? [];
  let synced = 0;

  for (const row of rows) {
    const [query, page, date] = row.keys ?? [];
    try {
      await db
        .insert(gscSearchPerformance)
        .values({
          projectId,
          date: date!,
          query: query ?? null,
          page: page ?? null,
          clicks: row.clicks ?? 0,
          impressions: row.impressions ?? 0,
          ctr: row.ctr ?? 0,
          position: row.position ?? 0,
        })
        .onConflictDoUpdate({
          target: [
            gscSearchPerformance.projectId,
            gscSearchPerformance.date,
            gscSearchPerformance.query,
            gscSearchPerformance.page,
          ],
          set: {
            clicks: sql`EXCLUDED.clicks`,
            impressions: sql`EXCLUDED.impressions`,
            ctr: sql`EXCLUDED.ctr`,
            position: sql`EXCLUDED.position`,
          },
        });
      synced++;
    } catch {
      // Skip duplicates/errors
    }
  }

  return { synced, dateRange: { from: formatDate(startDate), to: formatDate(endDate) } };
}

// ─── Routes ───

export async function gscRoutes(app: FastifyInstance) {
  // ─── OAuth Flow ───

  /** Generate OAuth2 authorization URL */
  app.get('/api/gsc/oauth/url', async (request, reply) => {
    const { projectId } = request.query as { projectId?: string };
    if (!projectId) return reply.status(400).send({ error: 'projectId is required' });

    const redirectUri = `${request.protocol}://${request.hostname}:${env.BACKEND_PORT}/api/gsc/oauth/callback`;
    const oauth2 = getOAuth2Client(redirectUri);

    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // Force consent to get refresh_token
      scope: ['https://www.googleapis.com/auth/webmasters.readonly'],
      state: projectId,
    });

    return { url };
  });

  /** OAuth2 callback — exchange code for tokens, store connection */
  app.get('/api/gsc/oauth/callback', async (request, reply) => {
    const { code, state: projectId } = request.query as { code?: string; state?: string };
    if (!code || !projectId) {
      return reply.status(400).send({ error: 'Missing code or state' });
    }

    const redirectUri = `${request.protocol}://${request.hostname}:${env.BACKEND_PORT}/api/gsc/oauth/callback`;
    const oauth2 = getOAuth2Client(redirectUri);

    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    // List available GSC properties to get a default siteUrl
    const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2 });
    const sites = await searchconsole.sites.list();
    const siteEntries = sites.data.siteEntry ?? [];
    const firstSite = siteEntries[0]?.siteUrl ?? '';

    // Upsert connection
    await db
      .insert(gscConnections)
      .values({
        projectId,
        siteUrl: firstSite,
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token!,
        tokenExpiresAt: new Date(tokens.expiry_date!),
      })
      .onConflictDoUpdate({
        target: [gscConnections.projectId],
        set: {
          siteUrl: firstSite,
          accessToken: tokens.access_token!,
          refreshToken: tokens.refresh_token!,
          tokenExpiresAt: new Date(tokens.expiry_date!),
        },
      });

    // Redirect back to dashboard
    const dashboardUrl = env.NODE_ENV === 'production'
      ? `/projects/${projectId}/keywords?gsc=connected`
      : `http://localhost:3000/projects/${projectId}/keywords?gsc=connected`;

    return reply.redirect(dashboardUrl);
  });

  // ─── Connection Management ───

  /** Check if project has GSC connected */
  app.get('/api/projects/:id/gsc/connection', async (request) => {
    const { id } = request.params as { id: string };
    const [conn] = await db
      .select()
      .from(gscConnections)
      .where(eq(gscConnections.projectId, id));

    return {
      connected: !!conn,
      siteUrl: conn?.siteUrl ?? null,
      connectedAt: conn?.connectedAt?.toISOString() ?? null,
    };
  });

  /** List available GSC properties */
  app.get('/api/projects/:id/gsc/sites', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const { oauth2 } = await getAuthenticatedClient(id);
      const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2 });
      const sites = await searchconsole.sites.list();
      return { data: (sites.data.siteEntry ?? []).map((s) => s.siteUrl) };
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  /** Update which GSC property is connected */
  app.patch('/api/projects/:id/gsc/connection', async (request) => {
    const { id } = request.params as { id: string };
    const { siteUrl } = request.body as { siteUrl: string };

    const [updated] = await db
      .update(gscConnections)
      .set({ siteUrl })
      .where(eq(gscConnections.projectId, id))
      .returning();

    return updated;
  });

  /** Disconnect GSC */
  app.delete('/api/projects/:id/gsc/connection', async (request) => {
    const { id } = request.params as { id: string };
    await db.delete(gscSearchPerformance).where(eq(gscSearchPerformance.projectId, id));
    await db.delete(gscConnections).where(eq(gscConnections.projectId, id));
    return { success: true };
  });

  // ─── Data Endpoints ───

  /** Manual sync — pull latest data from GSC */
  app.post('/api/projects/:id/gsc/sync', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      // Check if this is first sync (no data yet) — backfill 90 days
      const [existing] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(gscSearchPerformance)
        .where(eq(gscSearchPerformance.projectId, id));

      const isFirstSync = Number(existing?.count ?? 0) === 0;
      const result = await syncGscData(id, { daysBack: isFirstSync ? 90 : 7 });
      return result;
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  /** Query stored performance data */
  app.get('/api/projects/:id/gsc/performance', async (request) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };

    const conditions = [eq(gscSearchPerformance.projectId, id)];
    if (from) conditions.push(gte(gscSearchPerformance.date, from));
    if (to) conditions.push(lte(gscSearchPerformance.date, to));

    const rows = await db
      .select()
      .from(gscSearchPerformance)
      .where(and(...conditions))
      .orderBy(desc(gscSearchPerformance.date))
      .limit(5000);

    return { data: rows, meta: { total: rows.length } };
  });

  /** Top queries by clicks */
  app.get('/api/projects/:id/gsc/top-queries', async (request) => {
    const { id } = request.params as { id: string };
    const { from, to, limit: limitStr } = request.query as { from?: string; to?: string; limit?: string };
    const limit = parseInt(limitStr ?? '50', 10);

    // Default: last 28 days
    const endDate = to ?? new Date().toISOString().split('T')[0]!;
    const startDate = from ?? (() => {
      const d = new Date();
      d.setDate(d.getDate() - 28);
      return d.toISOString().split('T')[0]!;
    })();

    const rows = await db
      .select({
        query: gscSearchPerformance.query,
        clicks: sql<number>`SUM(${gscSearchPerformance.clicks})`.as('total_clicks'),
        impressions: sql<number>`SUM(${gscSearchPerformance.impressions})`.as('total_impressions'),
        avgPosition: sql<number>`AVG(${gscSearchPerformance.position})`.as('avg_position'),
        avgCtr: sql<number>`AVG(${gscSearchPerformance.ctr})`.as('avg_ctr'),
      })
      .from(gscSearchPerformance)
      .where(
        and(
          eq(gscSearchPerformance.projectId, id),
          gte(gscSearchPerformance.date, startDate),
          lte(gscSearchPerformance.date, endDate),
          sql`${gscSearchPerformance.query} IS NOT NULL`,
        ),
      )
      .groupBy(gscSearchPerformance.query)
      .orderBy(sql`total_clicks DESC`)
      .limit(limit);

    return { data: rows, meta: { total: rows.length, dateRange: { from: startDate, to: endDate } } };
  });

  /** Top pages by clicks */
  app.get('/api/projects/:id/gsc/top-pages', async (request) => {
    const { id } = request.params as { id: string };
    const { limit: limitStr } = request.query as { limit?: string };
    const limit = parseInt(limitStr ?? '50', 10);

    const d28ago = new Date();
    d28ago.setDate(d28ago.getDate() - 28);

    const rows = await db
      .select({
        page: gscSearchPerformance.page,
        clicks: sql<number>`SUM(${gscSearchPerformance.clicks})`.as('total_clicks'),
        impressions: sql<number>`SUM(${gscSearchPerformance.impressions})`.as('total_impressions'),
        avgPosition: sql<number>`AVG(${gscSearchPerformance.position})`.as('avg_position'),
      })
      .from(gscSearchPerformance)
      .where(
        and(
          eq(gscSearchPerformance.projectId, id),
          gte(gscSearchPerformance.date, d28ago.toISOString().split('T')[0]!),
          sql`${gscSearchPerformance.page} IS NOT NULL`,
        ),
      )
      .groupBy(gscSearchPerformance.page)
      .orderBy(sql`total_clicks DESC`)
      .limit(limit);

    return { data: rows };
  });

  /** Cross-reference GSC queries with discovered SEO keywords */
  app.get('/api/projects/:id/gsc/overlap', async (request) => {
    const { id } = request.params as { id: string };

    const d28ago = new Date();
    d28ago.setDate(d28ago.getDate() - 28);

    // Get top GSC queries
    const gscQueries = await db
      .select({
        query: gscSearchPerformance.query,
        clicks: sql<number>`SUM(${gscSearchPerformance.clicks})`.as('total_clicks'),
        impressions: sql<number>`SUM(${gscSearchPerformance.impressions})`.as('total_impressions'),
        avgPosition: sql<number>`AVG(${gscSearchPerformance.position})`.as('avg_position'),
      })
      .from(gscSearchPerformance)
      .where(
        and(
          eq(gscSearchPerformance.projectId, id),
          gte(gscSearchPerformance.date, d28ago.toISOString().split('T')[0]!),
          sql`${gscSearchPerformance.query} IS NOT NULL`,
        ),
      )
      .groupBy(gscSearchPerformance.query)
      .orderBy(sql`total_clicks DESC`)
      .limit(200);

    // Get SEO keywords for this project
    const seoKws = await db
      .select()
      .from(seoKeywords)
      .where(eq(seoKeywords.projectId, id));

    const seoKwSet = new Set(seoKws.map((k) => k.keyword.toLowerCase()));

    // Cross-reference
    const overlap = gscQueries.map((gq) => ({
      query: gq.query,
      clicks: gq.clicks,
      impressions: gq.impressions,
      avgPosition: gq.avgPosition,
      inSeoKeywords: seoKwSet.has((gq.query ?? '').toLowerCase()),
    }));

    return {
      data: overlap,
      summary: {
        totalGscQueries: gscQueries.length,
        matchingSeoKeywords: overlap.filter((o) => o.inSeoKeywords).length,
        newOpportunities: overlap.filter((o) => !o.inSeoKeywords).length,
      },
    };
  });
}

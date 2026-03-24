import type { FastifyInstance } from 'fastify';
import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apps } from '../db/schema/apps.js';
import { projects, discoveredKeywords } from '../db/schema/projects.js';
import { seoKeywords, seoContentPlans } from '../db/schema/seo.js';
import { SeoAgent } from '../agents/seo.js';
import { SeoKeywordDiscoverer } from '../lib/seo-discovery.js';

const discoverer = new SeoKeywordDiscoverer();

/**
 * Resolve seed keywords for SEO discovery.
 * Priority: explicit seeds > project.seedKeywords > app name + top discovered keywords
 */
async function resolveSeedKeywords(
  projectId: string,
  project: { seedKeywords: unknown; appId: string; name: string },
  explicit?: string[],
): Promise<string[]> {
  // 1. Explicit seeds from request body
  if (explicit && explicit.length > 0) return explicit.slice(0, 5);

  // 2. Project seed keywords (pre-launch projects)
  const configured = (project.seedKeywords as string[]) ?? [];
  if (configured.length > 0) return configured.slice(0, 5);

  // 3. Derive from app name + top discovered keywords (live projects)
  const seeds: string[] = [];

  // App name words (e.g., "MyMoney - Budget Tracker" → "budget tracker")
  const [appRow] = await db.select().from(apps).where(eq(apps.id, project.appId));
  if (appRow?.name) {
    // Extract meaningful words from app name (skip brand name before dash/colon)
    const afterSep = appRow.name.split(/[-–—:|]/).slice(1).join(' ').trim();
    const nameSource = afterSep || appRow.name;
    const words = nameSource
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w: string) => w.length > 3);
    if (words.length > 0) seeds.push(words.join(' '));
  }

  // Top discovered ASO keywords (already rank-verified = high quality)
  const topKws = await db
    .select({ keyword: discoveredKeywords.keyword })
    .from(discoveredKeywords)
    .where(eq(discoveredKeywords.projectId, projectId))
    .orderBy(sql`CASE WHEN ${discoveredKeywords.myRank} IS NOT NULL THEN 0 ELSE 1 END`, discoveredKeywords.myRank)
    .limit(10);

  for (const kw of topKws) {
    if (seeds.length >= 5) break;
    const lower = kw.keyword.toLowerCase();
    // Avoid duplicating what we already have
    if (!seeds.some((s) => s.includes(lower) || lower.includes(s))) {
      seeds.push(lower);
    }
  }

  // Fallback: just the project name
  if (seeds.length === 0 && project.name) {
    seeds.push(project.name.toLowerCase());
  }

  return seeds.slice(0, 5);
}

export async function seoRoutes(app: FastifyInstance) {
  // ─── SEO Keywords ───

  /** List all SEO keywords for a project */
  app.get('/api/projects/:id/seo/keywords', async (request, reply) => {
    const { id } = request.params as { id: string };

    const keywords = await db
      .select()
      .from(seoKeywords)
      .where(eq(seoKeywords.projectId, id))
      .orderBy(
        sql`CASE
          WHEN ${seoKeywords.priority} = 'high' THEN 0
          WHEN ${seoKeywords.priority} = 'medium' THEN 1
          ELSE 2
        END`,
        seoKeywords.keyword,
      );

    return { data: keywords, meta: { total: keywords.length } };
  });

  /** Discover SEO keywords (broad web mining) */
  app.post('/api/projects/:id/seo/discover', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { seeds?: string[] };

    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const seeds = await resolveSeedKeywords(id, project, body.seeds);
    if (seeds.length === 0) {
      return reply.status(400).send({
        error: 'No seed keywords available. Add seed keywords to the project or discover ASO keywords first.',
      });
    }

    const { keywords: rawKeywords, redditInsights } = await discoverer.discover(seeds, {
      lang: 'en',
      country: project.region,
      appName: project.name,
    });

    // Basic relevance filter: keyword must contain at least one seed word (3+ chars)
    const seedWords = new Set(
      seeds.flatMap((s) => s.split(/\s+/).filter((w) => w.length >= 3)),
    );
    const keywords = rawKeywords.filter((kw) => {
      const lower = kw.keyword.toLowerCase();
      // Question/comparison/modifier sources already contain the seed in the query
      if (['question', 'comparison', 'modifier'].includes(kw.source)) return true;
      // For other sources, check if at least one seed word appears
      for (const word of seedWords) {
        if (lower.includes(word)) return true;
      }
      return false;
    });

    console.log(`[seo] Relevance filter: ${keywords.length} / ${rawKeywords.length} keywords kept`);

    // Save keywords to DB (upsert)
    let savedCount = 0;
    for (const kw of keywords) {
      try {
        await db
          .insert(seoKeywords)
          .values({
            projectId: id,
            keyword: kw.keyword,
            source: kw.source,
            searchIntent: kw.searchIntent,
            contentType: kw.contentType,
            estimatedVolume: kw.estimatedVolume,
          })
          .onConflictDoNothing();
        savedCount++;
      } catch {
        // Skip duplicates
      }
    }

    // Save Reddit insights as content plans
    let insightsSaved = 0;
    for (const insight of redditInsights) {
      try {
        await db
          .insert(seoContentPlans)
          .values({
            projectId: id,
            title: insight.title,
            contentType: insight.suggestedContentType,
            cluster: 'reddit_insights',
            targetKeywords: seeds,
            outline: `${insight.contentAngle}\n\nSource: r/${insight.subreddit} (${insight.score} upvotes, ${insight.numComments} comments)\n${insight.url}`,
            priority: insight.score >= 50 || insight.numComments >= 20 ? 'high' : insight.score >= 10 ? 'medium' : 'low',
            metadata: {
              redditUrl: insight.url,
              subreddit: insight.subreddit,
              score: insight.score,
              numComments: insight.numComments,
              contentAngle: insight.contentAngle,
            },
          })
          .onConflictDoNothing();
        insightsSaved++;
      } catch {
        // Skip duplicates
      }
    }

    // Summary stats
    const bySource: Record<string, number> = {};
    const byIntent: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const kw of keywords) {
      bySource[kw.source] = (bySource[kw.source] ?? 0) + 1;
      byIntent[kw.searchIntent] = (byIntent[kw.searchIntent] ?? 0) + 1;
      byType[kw.contentType] = (byType[kw.contentType] ?? 0) + 1;
    }

    return {
      discovered: keywords.length,
      saved: savedCount,
      redditInsights: redditInsights.length,
      redditInsightsSaved: insightsSaved,
      bySource,
      byIntent,
      byType,
    };
  });

  /** Toggle tracking for an SEO keyword */
  app.post('/api/projects/:id/seo/keywords/:keywordId/track', async (request) => {
    const { keywordId } = request.params as { id: string; keywordId: string };

    const [kw] = await db
      .select()
      .from(seoKeywords)
      .where(eq(seoKeywords.id, keywordId));

    if (kw) {
      await db
        .update(seoKeywords)
        .set({ isTracking: !kw.isTracking })
        .where(eq(seoKeywords.id, keywordId));
    }

    return { success: true, isTracking: kw ? !kw.isTracking : false };
  });

  // ─── SEO Analysis (Agent) ───

  /** Run full SEO analysis — discover keywords + generate content strategy */
  app.post('/api/projects/:id/seo/analyze', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const seeds = await resolveSeedKeywords(id, project);
    if (seeds.length === 0) {
      return reply.status(400).send({
        error: 'No seed keywords available. Add seed keywords to the project or discover ASO keywords first.',
      });
    }

    const agent = new SeoAgent();
    const result = await agent.analyze(id);
    return result.data;
  });

  // ─── Content Plans ───

  /** List content plans for a project */
  app.get('/api/projects/:id/seo/content-plans', async (request) => {
    const { id } = request.params as { id: string };

    const plans = await db
      .select()
      .from(seoContentPlans)
      .where(eq(seoContentPlans.projectId, id))
      .orderBy(
        sql`CASE
          WHEN ${seoContentPlans.priority} = 'high' THEN 0
          WHEN ${seoContentPlans.priority} = 'medium' THEN 1
          ELSE 2
        END`,
        desc(seoContentPlans.createdAt),
      );

    return { data: plans, meta: { total: plans.length } };
  });

  /** Update content plan status */
  app.patch('/api/projects/:id/seo/content-plans/:planId', async (request) => {
    const { planId } = request.params as { id: string; planId: string };
    const body = request.body as { status?: string; outline?: string };

    const [updated] = await db
      .update(seoContentPlans)
      .set({
        ...(body.status ? { status: body.status } : {}),
        ...(body.outline ? { outline: body.outline } : {}),
        updatedAt: new Date(),
      })
      .where(eq(seoContentPlans.id, planId))
      .returning();

    return updated;
  });

  /** Delete a content plan */
  app.delete('/api/projects/:id/seo/content-plans/:planId', async (request) => {
    const { planId } = request.params as { id: string; planId: string };
    await db.delete(seoContentPlans).where(eq(seoContentPlans.id, planId));
    return { success: true };
  });

  // ─── SEO Stats ───

  /** Get SEO keyword stats for a project */
  app.get('/api/projects/:id/seo/stats', async (request) => {
    const { id } = request.params as { id: string };

    const [totalKw] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(seoKeywords)
      .where(eq(seoKeywords.projectId, id));

    const [totalPlans] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(seoContentPlans)
      .where(eq(seoContentPlans.projectId, id));

    const intentBreakdown = await db
      .select({
        intent: seoKeywords.searchIntent,
        count: sql<number>`COUNT(*)`,
      })
      .from(seoKeywords)
      .where(eq(seoKeywords.projectId, id))
      .groupBy(seoKeywords.searchIntent);

    const sourceBreakdown = await db
      .select({
        source: seoKeywords.source,
        count: sql<number>`COUNT(*)`,
      })
      .from(seoKeywords)
      .where(eq(seoKeywords.projectId, id))
      .groupBy(seoKeywords.source);

    const clusterBreakdown = await db
      .select({
        cluster: seoKeywords.cluster,
        count: sql<number>`COUNT(*)`,
      })
      .from(seoKeywords)
      .where(eq(seoKeywords.projectId, id))
      .groupBy(seoKeywords.cluster);

    return {
      totalKeywords: Number(totalKw?.count ?? 0),
      totalContentPlans: Number(totalPlans?.count ?? 0),
      byIntent: Object.fromEntries(intentBreakdown.map((r) => [r.intent, Number(r.count)])),
      bySource: Object.fromEntries(sourceBreakdown.map((r) => [r.source, Number(r.count)])),
      byClusters: Object.fromEntries(
        clusterBreakdown
          .filter((r) => r.cluster)
          .map((r) => [r.cluster, Number(r.count)]),
      ),
    };
  });
}

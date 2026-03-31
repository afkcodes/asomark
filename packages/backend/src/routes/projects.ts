import type { FastifyInstance } from 'fastify';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apps } from '../db/schema/apps.js';
import { projects, projectCompetitors, discoveredKeywords } from '../db/schema/projects.js';
import {
  listingDrafts,
  listingVersions,
  listingVariants,
} from '../db/schema/listing-drafts.js';
import { KeywordDiscoverer } from '../lib/discovery.js';
import { contentAnalyzer } from '../lib/analyzer.js';
import { changeLog } from '../db/schema/changelog.js';
import { listingSnapshots } from '../db/schema/listings.js';
import { inArray } from 'drizzle-orm';
import { PlayStoreSearchScraper } from '../scrapers/playstore/index.js';
import { COUNTRIES, getCountriesByTier } from '../lib/countries.js';
import { ListingCreatorAgent } from '../agents/listing-creator.js';
import { setupQueue } from '../workers/index.js';

const discoverer = new KeywordDiscoverer();
const playSearch = new PlayStoreSearchScraper();

function computeDifficulty(totalResults: number): number {
  if (totalResults === 0) return 0;
  if (totalResults <= 10) return 15;
  if (totalResults <= 30) return 30;
  if (totalResults <= 50) return 45;
  if (totalResults <= 100) return 60;
  if (totalResults <= 200) return 75;
  return 90;
}

export async function projectRoutes(app: FastifyInstance) {
  // ─── Projects CRUD ───

  app.post('/api/projects', async (request, reply) => {
    const body = request.body as {
      appId?: string;
      name: string;
      region?: string;
      mode?: 'live' | 'pre_launch';
      seedKeywords?: string[];
      category?: string;
      appDescription?: string;
      keyFeatures?: string[];
      targetAudience?: string;
    };

    if (!body.name) {
      return reply.status(400).send({ error: 'name is required' });
    }

    const mode = body.mode ?? 'live';

    if (mode === 'live') {
      if (!body.appId) {
        return reply.status(400).send({ error: 'appId is required for live projects' });
      }
      const [project] = await db
        .insert(projects)
        .values({
          appId: body.appId,
          name: body.name,
          region: body.region ?? 'us',
          mode,
          appDescription: body.appDescription ?? null,
          keyFeatures: body.keyFeatures ?? null,
          targetAudience: body.targetAudience ?? null,
        })
        .returning();

      // Enqueue background auto-setup (competitor discovery + keyword discovery)
      await setupQueue.add('project-setup', {
        type: 'project_setup' as const,
        projectId: project!.id,
      });

      return project;
    }

    // Pre-launch: create placeholder app, then project
    if (!body.seedKeywords || body.seedKeywords.length === 0) {
      return reply.status(400).send({ error: 'seedKeywords are required for pre-launch projects' });
    }

    const [placeholderApp] = await db
      .insert(apps)
      .values({
        name: body.name,
        platform: 'android',
        isOurs: true,
        category: body.category ?? null,
      })
      .returning();

    const [project] = await db
      .insert(projects)
      .values({
        appId: placeholderApp!.id,
        name: body.name,
        region: body.region ?? 'us',
        mode: 'pre_launch',
        seedKeywords: body.seedKeywords,
        category: body.category ?? null,
        appDescription: body.appDescription ?? null,
        keyFeatures: body.keyFeatures ?? null,
        targetAudience: body.targetAudience ?? null,
      })
      .returning();

    // Enqueue background auto-setup
    await setupQueue.add('project-setup', {
      type: 'project_setup' as const,
      projectId: project!.id,
    });

    return project;
  });

  app.get('/api/projects', async () => {
    const result = await db
      .select({
        project: projects,
        app: apps,
        competitorCount: sql<number>`(
          SELECT COUNT(*) FROM project_competitors
          WHERE project_id = ${projects.id}
        )`.as('competitor_count'),
        keywordCount: sql<number>`(
          SELECT COUNT(*) FROM discovered_keywords
          WHERE project_id = ${projects.id}
        )`.as('keyword_count'),
      })
      .from(projects)
      .innerJoin(apps, eq(projects.appId, apps.id))
      .where(eq(projects.isActive, true))
      .orderBy(desc(projects.createdAt));

    const rows = result.map((r) => ({
      ...r.project,
      app: r.app,
      competitorCount: Number(r.competitorCount),
      keywordCount: Number(r.keywordCount),
    }));
    return { data: rows, meta: { total: rows.length } };
  });

  app.get('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id));

    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const [projectApp] = await db.select().from(apps).where(eq(apps.id, project.appId));

    const competitors = await db
      .select({ competitor: projectCompetitors, app: apps })
      .from(projectCompetitors)
      .innerJoin(apps, eq(projectCompetitors.competitorAppId, apps.id))
      .where(eq(projectCompetitors.projectId, id));

    const keywordCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(discoveredKeywords)
      .where(eq(discoveredKeywords.projectId, id));

    return {
      ...project,
      app: projectApp,
      competitors: competitors.map((c) => ({ ...c.competitor, app: c.app })),
      keywordCount: Number(keywordCount[0]?.count ?? 0),
    };
  });

  app.patch('/api/projects/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      region?: string;
      seedKeywords?: string[];
      category?: string;
      appDescription?: string;
      keyFeatures?: string[];
      targetAudience?: string;
    };

    const [updated] = await db
      .update(projects)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.region !== undefined && { region: body.region }),
        ...(body.seedKeywords !== undefined && { seedKeywords: body.seedKeywords }),
        ...(body.category !== undefined && { category: body.category }),
        ...(body.appDescription !== undefined && { appDescription: body.appDescription }),
        ...(body.keyFeatures !== undefined && { keyFeatures: body.keyFeatures }),
        ...(body.targetAudience !== undefined && { targetAudience: body.targetAudience }),
      })
      .where(eq(projects.id, id))
      .returning();

    return updated;
  });

  app.delete('/api/projects/:id', async (request) => {
    const { id } = request.params as { id: string };
    // Hard delete — cascades clean up discoveredKeywords, projectCompetitors,
    // listingVersions/Variants/Drafts, seoKeywords/ContentPlans.
    // Global data (keywords, apps, keywordSnapshots, rankSnapshots) is preserved.
    await db.delete(projects).where(eq(projects.id, id));
    return { success: true };
  });

  // ─── Competitors ───

  app.post('/api/projects/:id/competitors', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { competitorAppId } = request.body as { competitorAppId: string };

    if (!competitorAppId) {
      return reply.status(400).send({ error: 'competitorAppId is required' });
    }

    try {
      const [entry] = await db
        .insert(projectCompetitors)
        .values({ projectId: id, competitorAppId })
        .returning();
      return entry;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('unique') || message.includes('duplicate')) {
        return reply.status(409).send({ error: 'Competitor already added to project' });
      }
      throw err;
    }
  });

  app.delete('/api/projects/:id/competitors/:competitorAppId', async (request) => {
    const { id, competitorAppId } = request.params as {
      id: string;
      competitorAppId: string;
    };

    await db
      .delete(projectCompetitors)
      .where(
        and(
          eq(projectCompetitors.projectId, id),
          eq(projectCompetitors.competitorAppId, competitorAppId),
        ),
      );

    return { success: true };
  });

  // ─── Discovered Keywords ───

  app.get('/api/projects/:id/keywords', async (request) => {
    const { id } = request.params as { id: string };

    const kws = await db
      .select()
      .from(discoveredKeywords)
      .where(eq(discoveredKeywords.projectId, id))
      .orderBy(
        sql`CASE WHEN ${discoveredKeywords.rank} IS NULL THEN 1 ELSE 0 END`,
        discoveredKeywords.rank,
      );

    return { data: kws, meta: { total: kws.length } };
  });

  app.delete('/api/projects/:id/keywords', async (request) => {
    const { id } = request.params as { id: string };
    await db.delete(discoveredKeywords).where(eq(discoveredKeywords.projectId, id));
    return { success: true };
  });

  app.post('/api/projects/:id/discover-all', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const [projectApp] = await db.select().from(apps).where(eq(apps.id, project.appId));

    const competitors = await db
      .select({ competitor: projectCompetitors, app: apps })
      .from(projectCompetitors)
      .innerJoin(apps, eq(projectCompetitors.competitorAppId, apps.id))
      .where(eq(projectCompetitors.projectId, id));

    const competitorPackages = competitors
      .map((c) => c.app.packageName)
      .filter((p): p is string => !!p);

    if (project.mode === 'pre_launch') {
      const seeds = (project.seedKeywords as string[]) ?? [];

      if (competitorPackages.length === 0 && seeds.length === 0) {
        return reply.status(400).send({ error: 'Add competitors or seed keywords to discover keywords' });
      }

      // ── Step 1: Auto-discover competitors from seeds (if none exist) ──
      let activeCompetitorPackages = [...competitorPackages];

      if (activeCompetitorPackages.length === 0 && seeds.length > 0) {
        console.log(`[pre-launch] No competitors — auto-discovering from ${seeds.length} seeds`);

        // Search Play Store for each seed, collect top apps by frequency
        const appFrequency = new Map<
          string,
          { appId: string; title: string; developer: string; icon: string; score: number | null; installs: string | null; count: number }
        >();

        for (const seed of seeds.slice(0, 5)) {
          try {
            const results = await playSearch.search(seed, { country: project.region });
            for (const result of results.slice(0, 10)) {
              const existing = appFrequency.get(result.appId);
              if (existing) {
                existing.count++;
              } else {
                appFrequency.set(result.appId, {
                  appId: result.appId,
                  title: result.title,
                  developer: result.developer,
                  icon: result.icon,
                  score: result.score,
                  installs: result.installs,
                  count: 1,
                });
              }
            }
          } catch {
            // Continue with other seeds
          }
        }

        // Take top 5 competitors by frequency (appear in most seed searches)
        const topCompetitors = Array.from(appFrequency.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        console.log(`[pre-launch] Found ${topCompetitors.length} competitors from seeds`);

        // Save competitors to DB
        for (const comp of topCompetitors) {
          try {
            let [compApp] = await db
              .select()
              .from(apps)
              .where(eq(apps.packageName, comp.appId));

            if (!compApp) {
              [compApp] = await db
                .insert(apps)
                .values({
                  name: comp.title,
                  platform: 'android',
                  packageName: comp.appId,
                  isOurs: false,
                })
                .returning();
            }

            if (compApp) {
              await db
                .insert(projectCompetitors)
                .values({ projectId: id, competitorAppId: compApp.id })
                .onConflictDoNothing();
              activeCompetitorPackages.push(comp.appId);
            }
          } catch {
            // Skip duplicates
          }
        }

        console.log(`[pre-launch] Saved ${activeCompetitorPackages.length} competitors`);
      }

      if (activeCompetitorPackages.length === 0) {
        return reply.status(400).send({ error: 'Could not find competitors from seed keywords. Try different seeds.' });
      }

      // ── Step 2: Discover keywords from competitors (same as live mode) ──
      // Phase 1: discover() per competitor — keywords where THEY rank (rank-verified)
      const allDiscovered: { keyword: string; rank: number; totalResults: number; sourcePackage: string }[] = [];

      for (const compPkg of activeCompetitorPackages) {
        try {
          const keywords = await discoverer.discover(compPkg, { country: project.region });
          console.log(`[pre-launch] Phase 1: ${compPkg} → ${keywords.length} rank-verified keywords`);
          allDiscovered.push(...keywords.map((k) => ({ ...k, sourcePackage: compPkg })));
        } catch (err) {
          console.error(`[pre-launch] Phase 1 error for ${compPkg}:`, (err as Error).message);
        }
      }

      // Deduplicate: keep best rank per keyword
      const keywordMap = new Map<string, typeof allDiscovered[number]>();
      for (const kw of allDiscovered) {
        const existing = keywordMap.get(kw.keyword);
        if (!existing || kw.rank < existing.rank) {
          keywordMap.set(kw.keyword, kw);
        }
      }
      console.log(`[pre-launch] Phase 1 total: ${allDiscovered.length} raw, ${keywordMap.size} unique`);

      const uniqueKeywords = Array.from(keywordMap.values());
      console.log(`[pre-launch] Final: ${uniqueKeywords.length} unique keywords`);

      // ── Step 3: Save to DB ──
      // Refresh competitor list for pkgToAppId mapping
      const freshComps = await db
        .select({ competitor: projectCompetitors, app: apps })
        .from(projectCompetitors)
        .innerJoin(apps, eq(projectCompetitors.competitorAppId, apps.id))
        .where(eq(projectCompetitors.projectId, id));

      const pkgToAppId = new Map<string, string>();
      for (const c of freshComps) {
        if (c.app.packageName) pkgToAppId.set(c.app.packageName, c.app.id);
      }

      let savedCount = 0;
      for (const kw of uniqueKeywords) {
        const sourceAppDbId = pkgToAppId.get(kw.sourcePackage) ?? null;
        try {
          await db
            .insert(discoveredKeywords)
            .values({
              projectId: id,
              sourceAppId: sourceAppDbId,
              keyword: kw.keyword,
              rank: kw.rank,
              myRank: null, // Pre-launch — no rank for us
              bestCompRank: kw.rank,
              bestCompPackage: kw.sourcePackage || null,
              totalResults: kw.totalResults,
              difficulty: computeDifficulty(kw.totalResults),
              source: 'play_autocomplete',
            })
            .onConflictDoNothing();
          savedCount++;
        } catch {
          // Duplicate, skip
        }
      }

      return {
        competitorsDiscovered: activeCompetitorPackages.length,
        discovered: uniqueKeywords.length,
        saved: savedCount,
        keywords: uniqueKeywords
          .sort((a, b) => a.rank - b.rank)
          .slice(0, 50)
          .map((k) => ({ keyword: k.keyword, rank: k.rank, sourcePackage: k.sourcePackage })),
      };
    }

    // ── Live mode: aso-agent approach — discover per competitor, then check my ranks ──

    if (!projectApp?.packageName) {
      return reply.status(400).send({ error: 'Project app has no package name' });
    }

    // Build a map of packageName → app DB id for saving sourceAppId
    const pkgToAppId = new Map<string, string>();
    for (const c of competitors) {
      if (c.app.packageName) pkgToAppId.set(c.app.packageName, c.app.id);
    }

    // Phase 1: Discover from each competitor (keywords where THEY rank)
    const allDiscovered: { keyword: string; rank: number; totalResults: number; sourcePackage: string }[] = [];

    for (const compPkg of competitorPackages) {
      try {
        const keywords = await discoverer.discover(compPkg, { country: project.region });
        console.log(`[discover] Phase 1: ${compPkg} → ${keywords.length} rank-verified keywords`);
        allDiscovered.push(...keywords.map((k) => ({ ...k, sourcePackage: compPkg })));
      } catch (err) {
        console.error(`[discover] Phase 1 error for ${compPkg}:`, (err as Error).message);
      }
    }

    // Also discover from our own app
    try {
      const myKeywords = await discoverer.discover(projectApp.packageName, { country: project.region });
      console.log(`[discover] Phase 1: OUR APP ${projectApp.packageName} → ${myKeywords.length} rank-verified keywords`);
      allDiscovered.push(...myKeywords.map((k) => ({ ...k, sourcePackage: projectApp.packageName! })));
    } catch (err) {
      console.error(`[discover] Phase 1 error for our app:`, (err as Error).message);
    }

    // Deduplicate phase 1: keep the best (lowest) rank per keyword
    const keywordMap = new Map<string, typeof allDiscovered[number]>();
    for (const kw of allDiscovered) {
      const existing = keywordMap.get(kw.keyword);
      if (!existing || kw.rank < existing.rank) {
        keywordMap.set(kw.keyword, kw);
      }
    }
    console.log(`[discover] Phase 1 total: ${allDiscovered.length} raw, ${keywordMap.size} unique after dedup`);

    // No cross-pollination step — matches aso-agent's approach.
    // Only keywords where a specific competitor ranks (from their title/desc autocomplete) are kept.
    // This prevents junk keywords from unrelated competitor rankings.

    const uniqueKeywords = Array.from(keywordMap.values());
    console.log(`[discover] Final: ${uniqueKeywords.length} unique keywords before Phase 2`);

    // Phase 2: Check MY rank for all discovered keywords
    const myRankResults = await discoverer.checkRanks(
      projectApp.packageName,
      uniqueKeywords.map((k) => k.keyword),
      { country: project.region },
    );
    const myRankMap = new Map(myRankResults.map((r) => [r.keyword, r.rank]));

    // Save to DB
    let savedCount = 0;
    for (const kw of uniqueKeywords) {
      const myRank = myRankMap.get(kw.keyword) ?? null;
      const sourceAppDbId = pkgToAppId.get(kw.sourcePackage) ?? null;

      try {
        await db
          .insert(discoveredKeywords)
          .values({
            projectId: id,
            sourceAppId: sourceAppDbId,
            keyword: kw.keyword,
            rank: kw.rank, // competitor's rank
            myRank: myRank === -1 ? null : myRank,
            bestCompRank: kw.rank, // the source competitor's rank IS the best comp rank
            bestCompPackage: kw.sourcePackage,
            totalResults: kw.totalResults,
            difficulty: computeDifficulty(kw.totalResults),
            source: 'play_autocomplete',
          })
          .onConflictDoNothing();
        savedCount++;
      } catch {
        // Duplicate, skip
      }
    }

    return {
      discovered: uniqueKeywords.length,
      saved: savedCount,
      keywords: uniqueKeywords
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 50)
        .map((k) => ({
          keyword: k.keyword,
          rank: k.rank,
          myRank: myRankMap.get(k.keyword) ?? null,
          totalResults: k.totalResults,
          source: k.sourcePackage,
        })),
    };
  });

  app.post('/api/projects/:id/check-my-ranks', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    const [projectApp] = await db.select().from(apps).where(eq(apps.id, project.appId));
    if (!projectApp?.packageName) {
      return reply.status(400).send({ error: 'Project app has no package name' });
    }

    // Get all discovered keywords
    const kws = await db
      .select()
      .from(discoveredKeywords)
      .where(eq(discoveredKeywords.projectId, id));

    const keywordTerms = kws.map((k) => k.keyword);
    if (keywordTerms.length === 0) return { updated: 0 };

    // Check ranks in batches
    const rankMap = await playSearch.getRanks(
      keywordTerms.slice(0, 50),
      projectApp.packageName,
      { lang: 'en', country: project.region },
    );

    // Update DB
    let updated = 0;
    for (const kw of kws) {
      const newRank = rankMap.get(kw.keyword) ?? null;
      if (newRank !== kw.myRank) {
        await db
          .update(discoveredKeywords)
          .set({ myRank: newRank })
          .where(eq(discoveredKeywords.id, kw.id));
        updated++;
      }
    }

    return {
      checked: Math.min(keywordTerms.length, 50),
      updated,
      ranks: Object.fromEntries(rankMap),
    };
  });

  app.post('/api/projects/:id/keywords/:keywordId/track', async (request) => {
    const { keywordId } = request.params as { id: string; keywordId: string };

    const [kw] = await db
      .select()
      .from(discoveredKeywords)
      .where(eq(discoveredKeywords.id, keywordId));

    if (kw) {
      await db
        .update(discoveredKeywords)
        .set({ isTracking: !kw.isTracking })
        .where(eq(discoveredKeywords.id, keywordId));
    }

    return { success: true, isTracking: kw ? !kw.isTracking : false };
  });

  // ─── Competitor Auto-Discovery ───

  app.post('/api/projects/:id/discover-competitors', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { keywords?: string[] };

    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    // Use provided keywords or fall back to project seed keywords or derive from app name
    let seeds = body.keywords ?? (project.seedKeywords as string[]) ?? [];
    if (seeds.length === 0) {
      // For live projects: derive seeds from the app name
      const [appRow] = await db.select().from(apps).where(eq(apps.id, project.appId));
      if (appRow?.name) {
        const afterSep = appRow.name.split(/[-–—:|]/).slice(1).join(' ').trim();
        const nameSource = afterSep || appRow.name;
        const words = nameSource
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w: string) => w.length > 3);
        if (words.length > 0) seeds = [words.join(' '), ...words.slice(0, 2)];
      }
    }
    if (seeds.length === 0) {
      return reply.status(400).send({ error: 'No keywords provided and no seed keywords configured' });
    }

    // Search Play Store for each seed keyword
    const appFrequency = new Map<string, { app: import('../scrapers/playstore/parser.js').ParsedSearchResult; count: number }>();

    for (const seed of seeds.slice(0, 5)) {
      try {
        const results = await playSearch.search(seed, { country: project.region });
        for (const result of results.slice(0, 15)) {
          const existing = appFrequency.get(result.appId);
          if (existing) {
            existing.count++;
          } else {
            appFrequency.set(result.appId, { app: result, count: 1 });
          }
        }
      } catch {
        // Continue
      }
    }

    // Sort by frequency (apps that appear for multiple seeds are more relevant)
    const sorted = Array.from(appFrequency.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return {
      competitors: sorted.map((entry) => ({
        packageName: entry.app.appId,
        title: entry.app.title,
        developer: entry.app.developer,
        icon: entry.app.icon,
        score: entry.app.score,
        installs: entry.app.installs,
        category: entry.app.category ?? null,
        relevanceScore: entry.count,
      })),
    };
  });

  // ─── Listing Drafts ───

  app.get('/api/projects/:id/listing-draft', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [draft] = await db
      .select()
      .from(listingDrafts)
      .where(eq(listingDrafts.projectId, id))
      .orderBy(desc(listingDrafts.updatedAt))
      .limit(1);

    if (!draft) return reply.status(204).send();
    return draft;
  });

  app.post('/api/projects/:id/listing-draft', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      title?: string;
      shortDescription?: string;
      fullDescription?: string;
      appName?: string;
      developerName?: string;
    };

    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    // Check if draft exists
    const [existing] = await db
      .select()
      .from(listingDrafts)
      .where(eq(listingDrafts.projectId, id))
      .orderBy(desc(listingDrafts.updatedAt))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(listingDrafts)
        .set({
          title: body.title ?? existing.title,
          shortDescription: body.shortDescription ?? existing.shortDescription,
          fullDescription: body.fullDescription ?? existing.fullDescription,
          appName: body.appName ?? existing.appName,
          developerName: body.developerName ?? existing.developerName,
          updatedAt: new Date(),
        })
        .where(eq(listingDrafts.id, existing.id))
        .returning();
      return updated;
    }

    const [draft] = await db
      .insert(listingDrafts)
      .values({
        projectId: id,
        title: body.title ?? '',
        shortDescription: body.shortDescription ?? '',
        fullDescription: body.fullDescription ?? '',
        appName: body.appName ?? project.name,
        developerName: body.developerName ?? '',
      })
      .returning();

    return draft;
  });

  // ─── Listing Scorer ───

  app.post('/api/projects/:id/score-listing', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      title: string;
      shortDescription: string;
      fullDescription: string;
    };

    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    // Get discovered keywords (priority: tracked > ranked > all)
    const kws = await db
      .select()
      .from(discoveredKeywords)
      .where(eq(discoveredKeywords.projectId, id))
      .orderBy(
        sql`CASE WHEN ${discoveredKeywords.isTracking} THEN 0 ELSE 1 END`,
        sql`CASE WHEN ${discoveredKeywords.myRank} IS NOT NULL THEN 0 ELSE 1 END`,
        discoveredKeywords.myRank,
      );

    const targetKeywords = kws.slice(0, 30).map((k) => k.keyword);
    if (targetKeywords.length === 0) {
      return { overall: 0, title: { score: 0, charCount: 0, charLimit: 50, keywordsFound: [], keywordsMissing: [], density: [] }, shortDescription: { score: 0, charCount: 0, charLimit: 80, keywordsFound: [], density: [] }, fullDescription: { score: 0, charCount: 0, charLimit: 4000, keywordsFound: [], density: [] }, coverage: { score: 0, found: 0, total: 0, missing: [] } };
    }

    const fullText = `${body.title} ${body.shortDescription} ${body.fullDescription}`.toLowerCase();

    // Score title
    const titleFound = targetKeywords.filter((kw) => body.title.toLowerCase().includes(kw.toLowerCase()));
    const titleMissing = targetKeywords.slice(0, 10).filter((kw) => !body.title.toLowerCase().includes(kw.toLowerCase()));
    const titleDensity = contentAnalyzer.calculateMultiKeywordDensity(body.title, titleFound);
    const titleCharUsage = Math.min(body.title.length / 50, 1);
    const titleKeywordScore = Math.min((titleFound.length / Math.min(targetKeywords.length, 3)) * 100, 100);
    const titleScore = Math.round(titleKeywordScore * 0.7 + titleCharUsage * 100 * 0.3);

    // Score short description
    const shortDescFound = targetKeywords.filter((kw) => body.shortDescription.toLowerCase().includes(kw.toLowerCase()));
    const shortDescDensity = contentAnalyzer.calculateMultiKeywordDensity(body.shortDescription, shortDescFound);
    const shortDescCharUsage = Math.min(body.shortDescription.length / 80, 1);
    const shortDescKeywordScore = Math.min((shortDescFound.length / Math.min(targetKeywords.length, 5)) * 100, 100);
    const shortDescScore = Math.round(shortDescKeywordScore * 0.6 + shortDescCharUsage * 100 * 0.4);

    // Score full description
    const fullDescFound = targetKeywords.filter((kw) => body.fullDescription.toLowerCase().includes(kw.toLowerCase()));
    const fullDescDensity = contentAnalyzer.calculateMultiKeywordDensity(body.fullDescription, fullDescFound.slice(0, 10));
    const fullDescLen = body.fullDescription.length;
    const fullDescLenScore = fullDescLen >= 2000 ? 100 : fullDescLen >= 1000 ? 70 : fullDescLen >= 500 ? 40 : 10;
    const fullDescKeywordScore = Math.min((fullDescFound.length / Math.min(targetKeywords.length, 10)) * 100, 100);
    const fullDescScore = Math.round(fullDescKeywordScore * 0.6 + fullDescLenScore * 0.4);

    // Coverage
    const allFound = targetKeywords.filter((kw) => fullText.includes(kw.toLowerCase()));
    const allMissing = targetKeywords.filter((kw) => !fullText.includes(kw.toLowerCase()));
    const coverageScore = Math.round((allFound.length / targetKeywords.length) * 100);

    // Overall weighted score
    const overall = Math.round(titleScore * 0.35 + shortDescScore * 0.20 + fullDescScore * 0.20 + coverageScore * 0.25);

    return {
      overall,
      title: { score: titleScore, charCount: body.title.length, charLimit: 50, keywordsFound: titleFound, keywordsMissing: titleMissing, density: titleDensity },
      shortDescription: { score: shortDescScore, charCount: body.shortDescription.length, charLimit: 80, keywordsFound: shortDescFound, density: shortDescDensity },
      fullDescription: { score: fullDescScore, charCount: body.fullDescription.length, charLimit: 4000, keywordsFound: fullDescFound, density: fullDescDensity },
      coverage: { score: coverageScore, found: allFound.length, total: targetKeywords.length, missing: allMissing },
    };
  });

  // ─── Listing Generation (ASO Agent) ───

  app.post('/api/projects/:id/generate-listing', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    // Validate that keywords exist
    const [kwCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(discoveredKeywords)
      .where(eq(discoveredKeywords.projectId, id));

    if (Number(kwCount?.count ?? 0) === 0) {
      return reply.status(400).send({
        error: 'No discovered keywords. Run keyword discovery first.',
      });
    }

    const agent = new ListingCreatorAgent();
    const result = await agent.generate(id);
    return result.data;
  });

  app.get('/api/projects/:id/listing-versions', async (request) => {
    const { id } = request.params as { id: string };

    const versions = await db
      .select()
      .from(listingVersions)
      .where(eq(listingVersions.projectId, id))
      .orderBy(desc(listingVersions.versionNumber));

    // For each version, get variant summaries
    const result = [];
    for (const version of versions) {
      const variants = await db
        .select()
        .from(listingVariants)
        .where(eq(listingVariants.versionId, version.id))
        .orderBy(listingVariants.variantIndex);

      result.push({
        ...version,
        variants: variants.map((v) => ({
          id: v.id,
          variantIndex: v.variantIndex,
          strategyName: v.strategyName,
          title: v.title,
          shortDescription: v.shortDescription,
          fullDescription: v.fullDescription,
          scores: v.scores,
          isActive: v.isActive,
          rationale: v.rationale,
          warnings: v.warnings,
          keywordsUsed: v.keywordsUsed,
        })),
      });
    }

    return { data: result, meta: { total: result.length } };
  });

  app.get('/api/projects/:id/listing-versions/:vid', async (request, reply) => {
    const { id, vid } = request.params as { id: string; vid: string };

    const [version] = await db
      .select()
      .from(listingVersions)
      .where(
        and(
          eq(listingVersions.id, vid),
          eq(listingVersions.projectId, id),
        ),
      );

    if (!version) return reply.status(404).send({ error: 'Version not found' });

    const variants = await db
      .select()
      .from(listingVariants)
      .where(eq(listingVariants.versionId, vid))
      .orderBy(listingVariants.variantIndex);

    return { ...version, variants };
  });

  app.post('/api/projects/:id/listing-variants/:varId/activate', async (request, reply) => {
    const { id, varId } = request.params as { id: string; varId: string };

    // Get the variant
    const [variant] = await db
      .select()
      .from(listingVariants)
      .where(
        and(
          eq(listingVariants.id, varId),
          eq(listingVariants.projectId, id),
        ),
      );

    if (!variant) return reply.status(404).send({ error: 'Variant not found' });

    // Deactivate all variants for this project
    await db
      .update(listingVariants)
      .set({ isActive: false })
      .where(
        and(
          eq(listingVariants.projectId, id),
          eq(listingVariants.isActive, true),
        ),
      );

    // Activate chosen variant
    await db
      .update(listingVariants)
      .set({ isActive: true })
      .where(eq(listingVariants.id, varId));

    // Copy to working draft
    const [existingDraft] = await db
      .select()
      .from(listingDrafts)
      .where(eq(listingDrafts.projectId, id))
      .orderBy(desc(listingDrafts.updatedAt))
      .limit(1);

    if (existingDraft) {
      await db
        .update(listingDrafts)
        .set({
          title: variant.title,
          shortDescription: variant.shortDescription,
          fullDescription: variant.fullDescription,
          activeVariantId: varId,
          sourceVersionId: variant.versionId,
          updatedAt: new Date(),
        })
        .where(eq(listingDrafts.id, existingDraft.id));
    } else {
      const [project] = await db.select().from(projects).where(eq(projects.id, id));
      await db.insert(listingDrafts).values({
        projectId: id,
        title: variant.title,
        shortDescription: variant.shortDescription,
        fullDescription: variant.fullDescription,
        appName: project?.name ?? '',
        activeVariantId: varId,
        sourceVersionId: variant.versionId,
      });
    }

    return { success: true, variant };
  });

  // ─── Countries ───

  // ─── Keyword Overlap / Cannibalization Matrix ───

  app.get('/api/projects/:id/keyword-overlap', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    // Get our app
    const [ourApp] = await db.select().from(apps).where(eq(apps.id, project.appId));

    // Get competitors
    const comps = await db
      .select({ app: apps })
      .from(projectCompetitors)
      .innerJoin(apps, eq(projectCompetitors.competitorAppId, apps.id))
      .where(eq(projectCompetitors.projectId, id));

    // Get all keywords
    const keywords = await db
      .select()
      .from(discoveredKeywords)
      .where(eq(discoveredKeywords.projectId, id));

    // Build the matrix: for each keyword, show which apps rank
    const allApps = [
      { id: ourApp?.id, name: ourApp?.name ?? project.name, packageName: ourApp?.packageName, isOurs: true },
      ...comps.map((c) => ({
        id: c.app.id,
        name: c.app.name,
        packageName: c.app.packageName,
        isOurs: false,
      })),
    ];

    // Build keyword rows with per-app rank data
    const matrix = keywords.map((kw) => {
      const appRanks: Record<string, number | null> = {};

      // Our app rank
      if (ourApp?.packageName) {
        appRanks[ourApp.packageName] = kw.myRank;
      }

      // Best competitor rank (we know which package)
      if (kw.bestCompPackage) {
        appRanks[kw.bestCompPackage] = kw.bestCompRank;
      }

      // Detect cannibalization: both we and a competitor rank in top 10
      const isCannibalized =
        kw.myRank != null &&
        kw.myRank <= 10 &&
        kw.bestCompRank != null &&
        kw.bestCompRank <= kw.myRank;

      // Detect opportunity: competitor ranks but we don't
      const isOpportunity = kw.myRank == null && kw.bestCompRank != null && kw.bestCompRank <= 10;

      // Detect threat: competitor outranks us significantly
      const isThreat =
        kw.myRank != null &&
        kw.bestCompRank != null &&
        kw.bestCompRank < kw.myRank &&
        kw.myRank - kw.bestCompRank >= 5;

      return {
        keyword: kw.keyword,
        difficulty: kw.difficulty,
        volume: kw.volume,
        myRank: kw.myRank,
        bestCompRank: kw.bestCompRank,
        bestCompPackage: kw.bestCompPackage,
        appRanks,
        flags: {
          cannibalized: isCannibalized,
          opportunity: isOpportunity,
          threat: isThreat,
        },
      };
    });

    // Summary stats
    const totalKeywords = keywords.length;
    const withMyRank = keywords.filter((k) => k.myRank != null).length;
    const opportunities = matrix.filter((m) => m.flags.opportunity).length;
    const threats = matrix.filter((m) => m.flags.threat).length;
    const cannibalized = matrix.filter((m) => m.flags.cannibalized).length;

    // Overlap between apps: count shared keywords
    const overlapPairs: { app1: string; app2: string; sharedKeywords: number }[] = [];
    if (ourApp?.packageName) {
      for (const comp of comps) {
        if (!comp.app.packageName) continue;
        const shared = keywords.filter(
          (k) =>
            k.myRank != null &&
            k.bestCompPackage === comp.app.packageName &&
            k.bestCompRank != null,
        ).length;
        overlapPairs.push({
          app1: ourApp.packageName,
          app2: comp.app.packageName,
          sharedKeywords: shared,
        });
      }
    }

    return {
      apps: allApps,
      matrix: matrix.sort((a, b) => {
        // Opportunities first, then threats, then by difficulty
        if (a.flags.opportunity !== b.flags.opportunity) return a.flags.opportunity ? -1 : 1;
        if (a.flags.threat !== b.flags.threat) return a.flags.threat ? -1 : 1;
        return (a.difficulty ?? 100) - (b.difficulty ?? 100);
      }),
      overlap: overlapPairs,
      summary: {
        totalKeywords,
        rankedKeywords: withMyRank,
        opportunities,
        threats,
        cannibalized,
      },
    };
  });

  // ─── Listing Diff Viewer (Competitor Change History) ───

  app.get('/api/projects/:id/competitor-changes', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return reply.status(404).send({ error: 'Project not found' });

    // Get all competitor app IDs
    const comps = await db
      .select({ app: apps })
      .from(projectCompetitors)
      .innerJoin(apps, eq(projectCompetitors.competitorAppId, apps.id))
      .where(eq(projectCompetitors.projectId, id));

    const compIds = comps.map((c) => c.app.id);
    if (compIds.length === 0) return { changes: [], apps: [] };

    // Get changelog entries for all competitors
    const changes = await db
      .select()
      .from(changeLog)
      .where(inArray(changeLog.appId, compIds))
      .orderBy(desc(changeLog.timestamp))
      .limit(200);

    // Get listing snapshots for competitors
    const snapshots = await db
      .select()
      .from(listingSnapshots)
      .where(inArray(listingSnapshots.appId, compIds))
      .orderBy(desc(listingSnapshots.snapshotDate));

    // Group snapshots by app for diffing
    const snapshotsByApp = new Map<string, typeof snapshots>();
    for (const snap of snapshots) {
      if (!snap.appId) continue;
      const arr = snapshotsByApp.get(snap.appId) ?? [];
      arr.push(snap);
      snapshotsByApp.set(snap.appId, arr);
    }

    // Compute diffs between consecutive snapshots per app
    const diffs: {
      appId: string;
      appName: string;
      packageName: string | null;
      date: string | null;
      changes: { field: string; oldValue: string | null; newValue: string | null }[];
    }[] = [];

    const diffFields = ['title', 'shortDesc', 'longDesc', 'iconUrl', 'version', 'installsText'] as const;

    for (const comp of comps) {
      const appSnaps = snapshotsByApp.get(comp.app.id) ?? [];
      for (let i = 0; i < appSnaps.length - 1; i++) {
        const newer = appSnaps[i]!;
        const older = appSnaps[i + 1]!;
        const fieldChanges: { field: string; oldValue: string | null; newValue: string | null }[] = [];

        for (const field of diffFields) {
          const oldVal = older[field] as string | null;
          const newVal = newer[field] as string | null;
          if (oldVal !== newVal) {
            fieldChanges.push({ field, oldValue: oldVal, newValue: newVal });
          }
        }

        if (fieldChanges.length > 0) {
          diffs.push({
            appId: comp.app.id,
            appName: comp.app.name,
            packageName: comp.app.packageName,
            date: newer.snapshotDate,
            changes: fieldChanges,
          });
        }
      }
    }

    return {
      changelog: changes.map((c) => ({
        ...c,
        appName: comps.find((comp) => comp.app.id === c.appId)?.app.name ?? 'Unknown',
        packageName: comps.find((comp) => comp.app.id === c.appId)?.app.packageName ?? null,
      })),
      diffs: diffs.sort((a, b) => {
        if (!a.date || !b.date) return 0;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }),
      apps: comps.map((c) => ({
        id: c.app.id,
        name: c.app.name,
        packageName: c.app.packageName,
      })),
    };
  });

  app.get('/api/countries', async () => {
    return {
      countries: COUNTRIES,
      tiers: {
        T1: getCountriesByTier('T1'),
        T2: getCountriesByTier('T2'),
        T3: getCountriesByTier('T3'),
      },
    };
  });
}

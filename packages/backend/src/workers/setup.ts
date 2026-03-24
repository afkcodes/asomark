/**
 * Project Auto-Setup Worker
 *
 * When a project is created, this worker runs in the background to:
 * 1. Scrape app details (if live mode, populate app metadata)
 * 2. Auto-discover competitors via Play Store search
 * 3. Save top competitors to projectCompetitors
 * 4. Run keyword discovery from all competitors
 * 5. Send notification when complete
 */
import { createQueue, createWorker } from '../lib/queue.js';
import { db } from '../db/index.js';
import { apps } from '../db/schema/apps.js';
import { projects, projectCompetitors, discoveredKeywords } from '../db/schema/projects.js';
import { listingSnapshots } from '../db/schema/listings.js';
import { reviews } from '../db/schema/reviews.js';
import { eq, and } from 'drizzle-orm';
import {
  PlayStoreSearchScraper,
  PlayStoreDetailsScraper,
  PlayStoreReviewsScraper,
} from '../scrapers/playstore/index.js';
import { KeywordDiscoverer } from '../lib/discovery.js';
import { sendAlert } from '../lib/notifications.js';
import { eventBus } from '../lib/events.js';

// ─── Queue ───

export const setupQueue = createQueue('setup');

// ─── Types ───

interface SetupJobData {
  type: 'project_setup';
  projectId: string;
}

// ─── Worker ───

const playSearch = new PlayStoreSearchScraper();
const playDetails = new PlayStoreDetailsScraper();
const playReviews = new PlayStoreReviewsScraper();
const discoverer = new KeywordDiscoverer();

export const setupWorker = createWorker<SetupJobData>(
  'setup',
  async (job) => {
    const { projectId } = job.data;

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) throw new Error(`Project ${projectId} not found`);

    const [projectApp] = await db.select().from(apps).where(eq(apps.id, project.appId));
    if (!projectApp) throw new Error(`App for project ${projectId} not found`);

    console.log(`[setup] Starting auto-setup for project "${project.name}" (${project.mode})`);

    const stats = {
      appDetailsUpdated: false,
      competitorsFound: 0,
      competitorsSaved: 0,
      keywordsDiscovered: 0,
    };

    // ── Step 1: Scrape app details (live mode only) ──
    if (project.mode === 'live' && projectApp.packageName) {
      try {
        const details = await playDetails.getAppDetails(
          projectApp.packageName,
          'en',
          project.region,
        );
        if (details) {
          await db
            .update(apps)
            .set({
              name: details.title ?? projectApp.name,
              category: details.category ?? projectApp.category,
            })
            .where(eq(apps.id, projectApp.id));
          stats.appDetailsUpdated = true;
          console.log(`[setup] Updated app details for ${projectApp.packageName}`);
        }
      } catch {
        console.warn(`[setup] Failed to fetch app details for ${projectApp.packageName}`);
      }
    }

    // ── Step 2: Auto-discover competitors ──
    // Use seed keywords (pre-launch) or app name/category keywords (live)
    const seeds: string[] = [];

    if (project.seedKeywords && Array.isArray(project.seedKeywords)) {
      seeds.push(...(project.seedKeywords as string[]).slice(0, 5));
    }

    // For live mode, derive seeds from app name if no explicit seeds
    if (seeds.length === 0 && projectApp.name) {
      const nameWords = projectApp.name
        .split(/[-–—:|]/)
        .slice(1)
        .join(' ')
        .trim();
      const source = nameWords || projectApp.name;
      const words = source
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3);
      if (words.length > 0) seeds.push(words.join(' '));
      if (projectApp.category) seeds.push(projectApp.category.toLowerCase());
    }

    // Check existing competitors
    const existingComps = await db
      .select()
      .from(projectCompetitors)
      .where(eq(projectCompetitors.projectId, projectId));

    if (existingComps.length === 0 && seeds.length > 0) {
      // Search Play Store to find competitors
      const appFrequency = new Map<
        string,
        { appId: string; title: string; developer: string; icon: string; score: number | null; installs: string | null; count: number }
      >();

      for (const seed of seeds.slice(0, 5)) {
        try {
          const results = await playSearch.search(seed, { country: project.region });
          for (const result of results.slice(0, 15)) {
            // Skip our own app
            if (result.appId === projectApp.packageName) continue;

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
          // Continue
        }
      }

      // Take top 5 competitors by frequency
      const topCompetitors = Array.from(appFrequency.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      stats.competitorsFound = topCompetitors.length;

      // Save competitors to DB
      for (const comp of topCompetitors) {
        try {
          // Upsert the app
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
                category: projectApp.category,
              })
              .returning();
          }

          if (compApp) {
            await db
              .insert(projectCompetitors)
              .values({
                projectId,
                competitorAppId: compApp.id,
              })
              .onConflictDoNothing();
            stats.competitorsSaved++;
          }
        } catch {
          // Skip duplicates
        }
      }

      console.log(`[setup] Found ${stats.competitorsFound} competitors, saved ${stats.competitorsSaved}`);
    } else if (existingComps.length > 0) {
      console.log(`[setup] Project already has ${existingComps.length} competitors, skipping discovery`);
      stats.competitorsSaved = existingComps.length;
    }

    // ── Step 2b: Take baseline listing snapshots for all competitors + our app ──
    const allCompetitors = await db
      .select({ app: apps })
      .from(projectCompetitors)
      .innerJoin(apps, eq(projectCompetitors.competitorAppId, apps.id))
      .where(eq(projectCompetitors.projectId, projectId));

    const appsToSnapshot = [
      ...(projectApp.packageName ? [projectApp] : []),
      ...allCompetitors.map((c) => c.app),
    ];

    const today = new Date().toISOString().split('T')[0]!;
    let snapshotsTaken = 0;

    for (const app of appsToSnapshot) {
      if (!app.packageName) continue;
      try {
        const details = await playDetails.getAppDetails(app.packageName, 'en', project.region);
        if (!details) continue;

        await db.insert(listingSnapshots).values({
          appId: app.id,
          title: details.title,
          subtitle: null,
          shortDesc: details.shortDescription,
          longDesc: details.description,
          iconUrl: details.icon,
          screenshotUrls: details.screenshots,
          videoUrl: details.video ?? null,
          rating: details.score,
          reviewCount: details.ratings,
          installsText: details.installs,
          version: details.version,
          appSize: null,
          snapshotDate: today,
        });
        snapshotsTaken++;

        eventBus.emit('listing:snapshot_taken', { appId: app.id, snapshotId: '' });
      } catch {
        console.warn(`[setup] Failed to snapshot ${app.packageName}`);
      }
    }
    console.log(`[setup] Took ${snapshotsTaken} baseline listing snapshots`);

    // ── Step 2c: Scrape reviews for our app ──
    if (projectApp.packageName) {
      try {
        const appReviews = await playReviews.getReviews(projectApp.packageName, {
          num: 100,
          lang: 'en',
          country: project.region,
        });
        let reviewsSaved = 0;
        for (const review of appReviews) {
          try {
            await db.insert(reviews).values({
              appId: projectApp.id,
              platform: 'android',
              author: review.userName ?? null,
              rating: review.score ?? null,
              text: review.text ?? null,
              date: review.date ? new Date(review.date).toISOString().split('T')[0]! : null,
              language: 'en',
            });
            reviewsSaved++;
          } catch {
            // Skip duplicates
          }
        }
        console.log(`[setup] Scraped ${reviewsSaved} reviews for our app`);
      } catch {
        console.warn(`[setup] Failed to scrape reviews for ${projectApp.packageName}`);
      }
    }

    // ── Step 3: Run keyword discovery ──
    // Only if no keywords exist yet
    const existingKws = await db
      .select({ id: discoveredKeywords.id })
      .from(discoveredKeywords)
      .where(eq(discoveredKeywords.projectId, projectId))
      .limit(1);

    if (existingKws.length === 0) {
      // Get competitor packages
      const comps = await db
        .select({ app: apps })
        .from(projectCompetitors)
        .innerJoin(apps, eq(projectCompetitors.competitorAppId, apps.id))
        .where(eq(projectCompetitors.projectId, projectId));

      const competitorPackages = comps
        .map((c) => c.app.packageName)
        .filter((p): p is string => !!p);

      const pkgToAppId = new Map<string, string>();
      for (const c of comps) {
        if (c.app.packageName) pkgToAppId.set(c.app.packageName, c.app.id);
      }

      if (competitorPackages.length > 0) {
        // Phase 1: discover() per competitor — keywords where THEY rank
        const allDiscovered: { keyword: string; rank: number; totalResults: number; sourcePackage: string }[] = [];

        for (const compPkg of competitorPackages) {
          try {
            const keywords = await discoverer.discover(compPkg, { country: project.region });
            console.log(`[setup] Phase 1: ${compPkg} → ${keywords.length} keywords`);
            allDiscovered.push(...keywords.map((k) => ({ ...k, sourcePackage: compPkg })));
          } catch (err) {
            console.error(`[setup] Phase 1 error for ${compPkg}:`, (err as Error).message);
          }
        }

        // Also discover from our own app (live mode only)
        if (project.mode === 'live' && projectApp.packageName) {
          try {
            const myKeywords = await discoverer.discover(projectApp.packageName, { country: project.region });
            console.log(`[setup] Phase 1: OUR APP → ${myKeywords.length} keywords`);
            allDiscovered.push(...myKeywords.map((k) => ({ ...k, sourcePackage: projectApp.packageName! })));
          } catch (err) {
            console.error(`[setup] Phase 1 error for our app:`, (err as Error).message);
          }
        }

        // Dedup
        const keywordMap = new Map<string, typeof allDiscovered[number]>();
        for (const kw of allDiscovered) {
          const existing = keywordMap.get(kw.keyword);
          if (!existing || kw.rank < existing.rank) {
            keywordMap.set(kw.keyword, kw);
          }
        }

        // Save to DB
        const isLive = project.mode === 'live';
        for (const [, kw] of keywordMap) {
          const sourceAppDbId = pkgToAppId.get(kw.sourcePackage) ?? null;
          const isOurApp = isLive && kw.sourcePackage === projectApp.packageName;
          try {
            await db
              .insert(discoveredKeywords)
              .values({
                projectId,
                sourceAppId: sourceAppDbId,
                keyword: kw.keyword,
                rank: kw.rank,
                myRank: isOurApp ? kw.rank : null,
                bestCompRank: !isOurApp ? kw.rank : null,
                bestCompPackage: !isOurApp ? kw.sourcePackage : null,
                totalResults: kw.totalResults,
                source: 'play_autocomplete',
              })
              .onConflictDoNothing();
            stats.keywordsDiscovered++;
          } catch {
            // Skip duplicates
          }
        }

        console.log(`[setup] Discovered ${stats.keywordsDiscovered} keywords`);
      }
    }

    // ── Step 4: Notify ──
    eventBus.emit('project:setup_complete', {
      projectId,
      competitors: stats.competitorsSaved,
      keywords: stats.keywordsDiscovered,
    });

    await sendAlert({
      title: 'Project Setup Complete',
      message: `"${project.name}" is ready: ${stats.competitorsSaved} competitors, ${stats.keywordsDiscovered} keywords discovered`,
      severity: 'info',
      agent: 'setup',
    });

    console.log(`[setup] Complete: ${JSON.stringify(stats)}`);
    return stats;
  },
  { concurrency: 1 },
);

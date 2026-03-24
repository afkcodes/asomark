import { createQueue, createWorker } from '../lib/queue.js';
import { db } from '../db/index.js';
import { apps } from '../db/schema/apps.js';
import { listingSnapshots } from '../db/schema/listings.js';
import { scrapeJobs } from '../db/schema/scrape-jobs.js';
import { eq } from 'drizzle-orm';
import { PlayStoreDetailsScraper } from '../scrapers/playstore/index.js';
import { PlayStoreBatchReviewsScraper } from '../scrapers/playstore/index.js';

// ─── Queue ───

export const scrapingQueue = createQueue('scraping');

// ─── Types ───

interface ScrapeJobData {
  type: 'app_details' | 'listing_snapshot' | 'reviews';
  appId: string;
  options?: {
    reviewCount?: number;
    sort?: number;
    region?: string;
  };
}

// ─── Worker ───

const playDetails = new PlayStoreDetailsScraper();
const playReviews = new PlayStoreBatchReviewsScraper();

export const scrapingWorker = createWorker<ScrapeJobData>(
  'scraping',
  async (job) => {
    const { type, appId, options } = job.data;
    const today = new Date().toISOString().split('T')[0]!;

    // Get app
    const [app] = await db.select().from(apps).where(eq(apps.id, appId));
    if (!app?.packageName) throw new Error(`App ${appId} not found or no packageName`);

    // Update scrape job status
    const [scrapeJob] = await db
      .insert(scrapeJobs)
      .values({
        source: 'playstore',
        target: `${type}:${app.packageName}`,
        status: 'running',
        startedAt: new Date(),
      })
      .returning();

    try {
      let recordsScraped = 0;

      switch (type) {
        case 'app_details':
        case 'listing_snapshot': {
          const details = await playDetails.getAppDetails(app.packageName);
          if (details) {
            await db.insert(listingSnapshots).values({
              appId,
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
            recordsScraped = 1;
          }
          break;
        }

        case 'reviews': {
          const reviewData = await playReviews.getReviews(app.packageName, {
            num: options?.reviewCount ?? 100,
            sort: 'newest',
            lang: 'en',
            country: options?.region ?? 'us',
          });
          recordsScraped = reviewData.length;
          break;
        }
      }

      // Update scrape job as completed
      if (scrapeJob) {
        await db
          .update(scrapeJobs)
          .set({
            status: 'completed',
            completedAt: new Date(),
            recordsScraped,
          })
          .where(eq(scrapeJobs.id, scrapeJob.id));
      }

      return { recordsScraped };
    } catch (err) {
      // Update scrape job as failed
      if (scrapeJob) {
        await db
          .update(scrapeJobs)
          .set({
            status: 'failed',
            completedAt: new Date(),
            errors: err instanceof Error ? err.message : 'Unknown error',
          })
          .where(eq(scrapeJobs.id, scrapeJob.id));
      }
      throw err;
    }
  },
  { concurrency: 3 },
);

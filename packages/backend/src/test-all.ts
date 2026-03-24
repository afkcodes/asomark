/**
 * Integration test for all layers built so far.
 * Run: npx tsx src/test-all.ts
 */
import { env } from './config/env.js';
import { db } from './db/index.js';
import { apps } from './db/schema/apps.js';
import { keywords } from './db/schema/keywords.js';
import { rankSnapshots } from './db/schema/rankings.js';
import { listingSnapshots } from './db/schema/listings.js';
import { eq } from 'drizzle-orm';
import { redis } from './lib/redis.js';
import {
  PlayStoreDetailsScraper,
  PlayStoreSearchScraper,
  PlayStoreReviewsScraper,
} from './scrapers/playstore/index.js';
import { AppStoreScraper } from './scrapers/appstore.js';
import { GoogleSuggestScraper } from './scrapers/google-suggest.js';
import { RedditScraper } from './scrapers/reddit.js';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const SKIP = '\x1b[33m○\x1b[0m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition: boolean, label: string, detail = '') {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function skip(label: string, reason: string) {
  console.log(`  ${SKIP} ${label} (${reason})`);
  skipped++;
}

async function testEnv() {
  console.log(`\n${BOLD}[1/6] Environment${RESET}`);
  assert(!!env.DATABASE_URL, 'DATABASE_URL is set');
  assert(!!env.REDIS_URL, 'REDIS_URL is set');
  assert(env.BACKEND_PORT > 0, `BACKEND_PORT = ${env.BACKEND_PORT}`);
  assert(env.NODE_ENV === 'development', `NODE_ENV = ${env.NODE_ENV}`);
}

async function testDatabase() {
  console.log(`\n${BOLD}[2/6] Database (PostgreSQL)${RESET}`);

  // Insert test app
  const [testApp] = await db
    .insert(apps)
    .values({
      name: '__test_app__',
      platform: 'android',
      packageName: 'com.test.integration',
      isOurs: true,
    })
    .returning();
  assert(!!testApp?.id, `Insert app → id=${testApp?.id?.slice(0, 8)}...`);

  // Read it back
  const [readApp] = await db.select().from(apps).where(eq(apps.id, testApp!.id));
  assert(readApp?.name === '__test_app__', 'Read app back');

  // Insert test keyword
  const [testKw] = await db
    .insert(keywords)
    .values({ term: '__test_keyword__', platform: 'android', searchVolumeEst: 1234 })
    .returning();
  assert(!!testKw?.id, `Insert keyword → id=${testKw?.id?.slice(0, 8)}...`);

  // Insert rank snapshot (tests FK)
  const [testRank] = await db
    .insert(rankSnapshots)
    .values({
      appId: testApp!.id,
      keywordId: testKw!.id,
      platform: 'android',
      rank: 5,
      date: '2026-03-20',
    })
    .returning();
  assert(!!testRank?.id, `Insert rank snapshot with FKs → rank=${testRank?.rank}`);

  // Insert listing snapshot
  const [testListing] = await db
    .insert(listingSnapshots)
    .values({
      appId: testApp!.id,
      title: 'Test Title',
      shortDesc: 'Test description',
      rating: 4.5,
      reviewCount: 100,
      snapshotDate: '2026-03-20',
    })
    .returning();
  assert(!!testListing?.id, `Insert listing snapshot → title="${testListing?.title}"`);

  // Update
  const [updated] = await db
    .update(apps)
    .set({ category: 'tools' })
    .where(eq(apps.id, testApp!.id))
    .returning();
  assert(updated?.category === 'tools', 'Update app category');

  // Clean up (order matters due to FKs)
  await db.delete(listingSnapshots).where(eq(listingSnapshots.id, testListing!.id));
  await db.delete(rankSnapshots).where(eq(rankSnapshots.id, testRank!.id));
  await db.delete(keywords).where(eq(keywords.id, testKw!.id));
  await db.delete(apps).where(eq(apps.id, testApp!.id));

  // Verify cleanup
  const [gone] = await db.select().from(apps).where(eq(apps.id, testApp!.id));
  assert(!gone, 'Cleanup verified — test data removed');
}

async function testRedis() {
  console.log(`\n${BOLD}[3/6] Redis${RESET}`);

  await redis.set('test:ping', 'pong', 'EX', 10);
  const val = await redis.get('test:ping');
  assert(val === 'pong', 'SET/GET works');

  await redis.del('test:ping');
  const gone = await redis.get('test:ping');
  assert(gone === null, 'DEL works');

  const pong = await redis.ping();
  assert(pong === 'PONG', 'PING → PONG');
}

async function testPlayStoreScraper() {
  console.log(`\n${BOLD}[4/6] Play Store Scraper (direct HTTP)${RESET}`);

  const details = new PlayStoreDetailsScraper();
  const search = new PlayStoreSearchScraper();
  const reviews = new PlayStoreReviewsScraper();

  // Details
  const app = await details.getAppDetails('com.spotify.music');
  assert(app !== null, 'Fetch app details for Spotify');
  assert(app?.title?.includes('Spotify') ?? false, `Title: "${app?.title}"`);
  assert(app?.appId === 'com.spotify.music', `Package: ${app?.appId}`);
  assert((app?.score ?? 0) > 0, `Score: ${app?.score}`);
  assert((app?.ratings ?? 0) > 0, `Ratings: ${app?.ratings?.toLocaleString()}`);
  assert(app?.developer === 'Spotify AB', `Developer: ${app?.developer}`);
  assert((app?.screenshots?.length ?? 0) > 0, `Screenshots: ${app?.screenshots?.length}`);
  assert(!!app?.icon, 'Has icon URL');
  assert(!!app?.description, `Description: ${app?.description?.length} chars`);
  assert(!!app?.installs, `Installs: ${app?.installs}`);

  // Search
  const results = await search.search('music player');
  assert(results.length > 0, `Search "music player" → ${results.length} results`);
  assert(!!results[0]?.appId, `First result: ${results[0]?.title} (${results[0]?.appId})`);

  // Rank check
  const rank = await search.getRank('music streaming', 'com.spotify.music');
  if (rank !== null) {
    assert(rank > 0 && rank <= 50, `Spotify rank for "music streaming": #${rank}`);
  } else {
    skip('Rank check for Spotify', 'not in top results for this query');
  }

  // Suggest
  const suggestions = await search.suggest('fitness');
  assert(suggestions.length > 0, `Suggest "fitness" → ${suggestions.length} results`);

  // Reviews
  const revs = await reviews.getReviews('com.spotify.music', { num: 10 });
  assert(revs.length > 0, `Reviews for Spotify → ${revs.length} reviews`);
  assert((revs[0]?.score ?? 0) >= 1 && (revs[0]?.score ?? 0) <= 5, `First review: ${revs[0]?.score}★`);
  assert(!!revs[0]?.text, `Review text: "${revs[0]?.text?.slice(0, 50)}..."`);
}

async function testAppStoreScraper() {
  console.log(`\n${BOLD}[5/6] App Store Scraper (iTunes API)${RESET}`);

  const appstore = new AppStoreScraper();

  // Search
  const results = await appstore.search('fitness', { limit: 5 });
  assert(results.length > 0, `Search "fitness" → ${results.length} results`);
  assert(!!results[0]?.trackName, `First result: ${results[0]?.trackName}`);

  // Lookup by bundle ID
  const app = await appstore.lookup('com.spotify.client');
  if (app) {
    assert(app.trackName.includes('Spotify'), `Lookup Spotify: "${app.trackName}"`);
    assert(app.averageUserRating > 0, `Rating: ${app.averageUserRating}`);
    assert(app.screenshotUrls.length > 0, `Screenshots: ${app.screenshotUrls.length}`);
  } else {
    skip('App Store lookup', 'Spotify not found by bundleId');
  }

  // Rank check
  const rank = await appstore.getRank('music', 'com.spotify.client');
  if (rank !== null) {
    assert(rank > 0, `Spotify rank for "music": #${rank}`);
  } else {
    skip('App Store rank check', 'not in results');
  }
}

async function testOtherScrapers() {
  console.log(`\n${BOLD}[6/6] Other Scrapers${RESET}`);

  // Google Suggest
  const gs = new GoogleSuggestScraper();
  const suggestions = await gs.suggest('best fitness app');
  assert(suggestions.length > 0, `Google suggest → ${suggestions.length} results`);

  // Reddit
  const reddit = new RedditScraper();
  const posts = await reddit.search('best android apps', { limit: 5 });
  assert(posts.length > 0, `Reddit search → ${posts.length} posts`);
  assert(!!posts[0]?.title, `First post: "${posts[0]?.title?.slice(0, 50)}..."`);
}

// ─── Run all tests ───
console.log(`\n${'═'.repeat(50)}`);
console.log(`${BOLD}  ASOMARK Integration Tests${RESET}`);
console.log(`${'═'.repeat(50)}`);

try {
  await testEnv();
  await testDatabase();
  await testRedis();
  await testPlayStoreScraper();
  await testAppStoreScraper();
  await testOtherScrapers();
} catch (err) {
  console.error('\n\x1b[31mUnexpected error:\x1b[0m', err);
  failed++;
}

console.log(`\n${'─'.repeat(50)}`);
console.log(
  `  ${BOLD}Results:${RESET} ${PASS} ${passed} passed  ${failed > 0 ? FAIL : ''}${failed > 0 ? ` ${failed} failed` : ''}  ${skipped > 0 ? `${SKIP} ${skipped} skipped` : ''}`,
);
console.log(`${'─'.repeat(50)}\n`);

// Cleanup connections
await redis.quit();
process.exit(failed > 0 ? 1 : 0);

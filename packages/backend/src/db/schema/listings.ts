import { pgTable, uuid, text, real, integer, date, json, index } from 'drizzle-orm/pg-core';
import { apps } from './apps.js';

export const listingSnapshots = pgTable(
  'listing_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id').references(() => apps.id),
    title: text('title'),
    subtitle: text('subtitle'),
    shortDesc: text('short_desc'),
    longDesc: text('long_desc'),
    iconUrl: text('icon_url'),
    screenshotUrls: json('screenshot_urls'),
    videoUrl: text('video_url'),
    rating: real('rating'),
    reviewCount: integer('review_count'),
    installsText: text('installs_text'),
    version: text('version'),
    appSize: text('app_size'),
    snapshotDate: date('snapshot_date'),
    diffFromPrevious: text('diff_from_previous'),
  },
  (table) => [
    index('idx_listing_snapshots_app_date').on(table.appId, table.snapshotDate),
  ],
);

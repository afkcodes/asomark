import { pgTable, uuid, text, integer, real, boolean, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

/** Stores OAuth2 connection between a project and a Google Search Console property */
export const gscConnections = pgTable('gsc_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  siteUrl: text('site_url').notNull(), // e.g. "sc-domain:example.com" or "https://example.com/"
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }).notNull(),
  connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Daily search performance data pulled from Google Search Console */
export const gscSearchPerformance = pgTable(
  'gsc_search_performance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    date: text('date').notNull(), // "2026-03-30" format
    query: text('query'),         // search query (null for page-level aggregations)
    page: text('page'),           // URL path
    clicks: integer('clicks').notNull().default(0),
    impressions: integer('impressions').notNull().default(0),
    ctr: real('ctr').notNull().default(0),        // 0.0 to 1.0
    position: real('position').notNull().default(0), // avg position
    country: text('country'),
    device: text('device'),       // DESKTOP, MOBILE, TABLET
  },
  (table) => [
    unique().on(table.projectId, table.date, table.query, table.page),
    index('idx_gsc_perf_project_date').on(table.projectId, table.date),
  ],
);

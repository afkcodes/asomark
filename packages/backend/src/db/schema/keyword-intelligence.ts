/**
 * Historical keyword intelligence tables.
 * Captures data we scrape but currently discard — building our own
 * proprietary keyword database for volume/difficulty modeling over time.
 */
import {
  pgTable,
  uuid,
  text,
  real,
  integer,
  date,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { keywords } from './keywords.js';

// ─── keyword_snapshots ───
// Daily/weekly point-in-time capture of all keyword metrics.
// One row per keyword per snapshot date.

export const keywordSnapshots = pgTable(
  'keyword_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    keywordId: uuid('keyword_id')
      .references(() => keywords.id, { onDelete: 'cascade' })
      .notNull(),
    platform: text('platform', { enum: ['android', 'ios'] }),
    region: text('region').default('us'),
    snapshotDate: date('snapshot_date').notNull(),

    // Google Trends
    trendsInterestScore: real('trends_interest_score'),
    trendDirection: text('trend_direction'),
    trendsTimelineJson: jsonb('trends_timeline_json'),

    // Search result metrics
    topTenTitleOptRate: real('top_ten_title_opt_rate'),
    topTenAvgRating: real('top_ten_avg_rating'),
    topTenAvgInstalls: real('top_ten_avg_installs'),
    topTenAppIds: jsonb('top_ten_app_ids'), // string[] of package names in rank order
    resultCount: integer('result_count'),

    // Difficulty (frozen computation from that day)
    difficultyScore: real('difficulty_score'),
    difficultySignals: jsonb('difficulty_signals'), // DifficultySignals object
    difficultyMode: text('difficulty_mode'), // 'fast' | 'full'

    // Suggest positions across sources
    googleSuggestPosition: integer('google_suggest_position'),
    playstoreSuggestPosition: integer('playstore_suggest_position'),
    youtubeSuggestPosition: integer('youtube_suggest_position'),

    // Volume proxy
    searchVolumeProxy: real('search_volume_proxy'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_kw_snapshots_keyword_date').on(table.keywordId, table.snapshotDate),
    index('idx_kw_snapshots_date').on(table.snapshotDate),
  ],
);

// ─── keyword_related_queries ───
// Related query snapshots from Google Trends.
// Tracks how related queries shift over time for a keyword.

export const keywordRelatedQueries = pgTable(
  'keyword_related_queries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    keywordSnapshotId: uuid('keyword_snapshot_id')
      .references(() => keywordSnapshots.id, { onDelete: 'cascade' })
      .notNull(),
    relatedQuery: text('related_query').notNull(),
    category: text('category', { enum: ['rising', 'top'] }).notNull(),
    value: text('value').notNull(), // "Breakout", "+150%", or numeric string for top
    position: integer('position'), // 1-based rank in the list
    snapshotDate: date('snapshot_date').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_kw_related_snapshot').on(table.keywordSnapshotId),
    index('idx_kw_related_date').on(table.snapshotDate),
  ],
);

// ─── keyword_suggest_history ───
// Autocomplete position tracking across Google, Play Store, YouTube.
// Tracks when keywords appear/disappear and their position changes.

export const keywordSuggestHistory = pgTable(
  'keyword_suggest_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentKeyword: text('parent_keyword').notNull(),
    suggestedKeyword: text('suggested_keyword').notNull(),
    source: text('source', { enum: ['google', 'playstore', 'youtube', 'playstore_proxy'] }).notNull(),
    position: integer('position').notNull(), // 1-based
    region: text('region').default('us'),
    snapshotDate: date('snapshot_date').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_suggest_parent_date').on(table.parentKeyword, table.snapshotDate),
    index('idx_suggest_keyword_source').on(table.suggestedKeyword, table.source),
  ],
);

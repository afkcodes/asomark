import { pgTable, uuid, text, integer, date, index } from 'drizzle-orm/pg-core';
import { apps } from './apps.js';
import { keywords } from './keywords.js';

export const rankSnapshots = pgTable(
  'rank_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id').references(() => apps.id),
    keywordId: uuid('keyword_id').references(() => keywords.id),
    platform: text('platform', { enum: ['android', 'ios'] }),
    region: text('region').default('us'),
    rank: integer('rank'),
    date: date('date'),
    categoryRank: integer('category_rank'),
  },
  (table) => [
    index('idx_rank_snapshots_app_date').on(table.appId, table.date),
    index('idx_rank_snapshots_keyword_date').on(table.keywordId, table.date),
    index('idx_rank_snapshots_app_keyword').on(table.appId, table.keywordId),
  ],
);

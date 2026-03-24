import { pgTable, uuid, text, integer, real, timestamp, json, index } from 'drizzle-orm/pg-core';
import { apps } from './apps.js';
import { keywords } from './keywords.js';

export const changeLog = pgTable(
  'change_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appId: uuid('app_id').references(() => apps.id),
    changeType: text('change_type'),
    field: text('field'),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    source: text('source'),
    metadataJson: json('metadata_json'),
    timestamp: timestamp('timestamp', { withTimezone: true }),
  },
  (table) => [
    index('idx_changelog_app_timestamp').on(table.appId, table.timestamp),
  ],
);

export const rankCorrelations = pgTable('rank_correlations', {
  id: uuid('id').primaryKey().defaultRandom(),
  changeLogId: uuid('change_log_id').references(() => changeLog.id),
  keywordId: uuid('keyword_id').references(() => keywords.id),
  rankBefore: integer('rank_before'),
  rankAfter: integer('rank_after'),
  cvrBefore: real('cvr_before'),
  cvrAfter: real('cvr_after'),
  daysToEffect: integer('days_to_effect'),
  confidence: real('confidence'),
  notes: text('notes'),
});

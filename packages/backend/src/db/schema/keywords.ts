import { pgTable, uuid, text, real, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const keywords = pgTable('keywords', {
  id: uuid('id').primaryKey().defaultRandom(),
  term: text('term').notNull(),
  platform: text('platform', { enum: ['android', 'ios'] }),
  region: text('region').default('us'),
  searchVolumeEst: real('search_volume_est'),
  difficultyEst: real('difficulty_est'),
  trendDirection: text('trend_direction'),
  suggestPosition: integer('suggest_position'),
  titleOptRate: real('title_opt_rate'),
  difficultySignals: jsonb('difficulty_signals'),   // DifficultySignals object (7 signal breakdown)
  difficultyMode: text('difficulty_mode'),           // 'fast' | 'full'
  lastUpdated: timestamp('last_updated', { withTimezone: true }),
});

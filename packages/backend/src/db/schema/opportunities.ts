import { pgTable, uuid, integer, real, text, timestamp } from 'drizzle-orm/pg-core';
import { keywords } from './keywords.js';
import { apps } from './apps.js';

export const keywordOpportunities = pgTable('keyword_opportunities', {
  id: uuid('id').primaryKey().defaultRandom(),
  keywordId: uuid('keyword_id').references(() => keywords.id),
  appId: uuid('app_id').references(() => apps.id),
  currentRank: integer('current_rank'),
  potentialRank: integer('potential_rank'),
  opportunityScore: real('opportunity_score'),
  suggestedAction: text('suggested_action'),
  createdAt: timestamp('created_at', { withTimezone: true }),
});

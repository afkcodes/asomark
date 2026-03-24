import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { apps } from './apps.js';

export const strategyLog = pgTable('strategy_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  appId: uuid('app_id').references(() => apps.id),
  actionType: text('action_type'),
  reasoning: text('reasoning'),
  suggestedChange: text('suggested_change'),
  authorityLevel: text('authority_level', { enum: ['L0', 'L1', 'L2', 'L3'] }),
  status: text('status'),
  createdAt: timestamp('created_at', { withTimezone: true }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  executedAt: timestamp('executed_at', { withTimezone: true }),
});

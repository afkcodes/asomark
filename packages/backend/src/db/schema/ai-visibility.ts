import { pgTable, uuid, text, integer, real, boolean, timestamp, json, index } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

/** Tracks how AI models mention/recommend the brand */
export const aiVisibilityChecks = pgTable(
  'ai_visibility_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    prompt: text('prompt').notNull(),
    platform: text('platform').notNull(), // 'claude', 'openai', 'perplexity'
    response: text('response').notNull(),
    mentioned: boolean('mentioned').notNull().default(false),
    sentiment: text('sentiment', { enum: ['positive', 'neutral', 'negative'] }),
    position: integer('position'), // 1st mentioned, 2nd, etc. null if not mentioned
    competitors_mentioned: json('competitors_mentioned').$type<string[]>(),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_vis_project_date').on(table.projectId, table.checkedAt),
  ],
);

/** Stores the prompts to ask AI models about the brand */
export const aiVisibilityPrompts = pgTable('ai_visibility_prompts', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  prompt: text('prompt').notNull(),
  category: text('category', { enum: ['recommendation', 'comparison', 'brand', 'feature'] }).notNull().default('recommendation'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

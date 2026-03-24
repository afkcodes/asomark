import { pgTable, uuid, text, boolean, real, timestamp, json } from 'drizzle-orm/pg-core';
import { apps } from './apps.js';

export const experiments = pgTable('experiments', {
  id: uuid('id').primaryKey().defaultRandom(),
  appId: uuid('app_id').references(() => apps.id),
  platform: text('platform', { enum: ['android', 'ios'] }),
  type: text('type'),
  status: text('status', {
    enum: [
      'planning',
      'pending',
      'approved',
      'creating',
      'running',
      'monitoring',
      'analyzing',
      'winner',
      'no_winner',
      'applied',
      'rejected',
      'failed',
    ],
  }),
  variantsJson: json('variants_json'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  resultsJson: json('results_json'),
  winner: text('winner'),
  applied: boolean('applied'),
  confidence: real('confidence'),
});

export const experimentChanges = pgTable('experiment_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  experimentId: uuid('experiment_id').references(() => experiments.id),
  fieldChanged: text('field_changed'),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  changeDate: text('change_date'),
  impactMetricsJson: json('impact_metrics_json'),
});

import { pgTable, uuid, integer, date, json } from 'drizzle-orm/pg-core';
import { apps } from './apps.js';

export const healthScores = pgTable('health_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  appId: uuid('app_id').references(() => apps.id),
  overallScore: integer('overall_score'),
  breakdownJson: json('breakdown_json'),
  date: date('date'),
});

import { pgTable, uuid, text, integer, real, date, json } from 'drizzle-orm/pg-core';
import { apps } from './apps.js';

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  appId: uuid('app_id').references(() => apps.id),
  platform: text('platform', { enum: ['android', 'ios'] }),
  author: text('author'),
  rating: integer('rating'),
  text: text('text'),
  date: date('date'),
  sentimentScore: real('sentiment_score'),
  topicsJson: json('topics_json'),
  language: text('language'),
});

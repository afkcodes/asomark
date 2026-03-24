import IORedis from 'ioredis';
import { env } from '../config/env.js';

export const redis = new IORedis.default(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export type { IORedis };

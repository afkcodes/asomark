import { Queue, Worker, type Processor, type WorkerOptions } from 'bullmq';
import { env } from '../config/env.js';

const connection = {
  url: env.REDIS_URL,
};

export function createQueue(name: string) {
  return new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}

export function createWorker<T>(
  name: string,
  processor: Processor<T>,
  opts?: Partial<WorkerOptions>,
) {
  return new Worker<T>(name, processor, {
    connection,
    concurrency: 5,
    ...opts,
  });
}

/**
 * Event Bus — Lightweight typed pub/sub for cross-module communication.
 *
 * Usage:
 *   import { eventBus } from '../lib/events.js';
 *   eventBus.on('keyword:discovered', (data) => { ... });
 *   eventBus.emit('keyword:discovered', { projectId, count: 42 });
 */
import { EventEmitter } from 'node:events';

// ─── Event Definitions ───

export interface AppEvents {
  // Project lifecycle
  'project:created': { projectId: string; mode: 'live' | 'pre_launch' };
  'project:setup_complete': { projectId: string; competitors: number; keywords: number };

  // Keyword events
  'keyword:discovered': { projectId: string; count: number };
  'keyword:rank_changed': { projectId: string; keyword: string; oldRank: number | null; newRank: number | null };

  // Listing events
  'listing:snapshot_taken': { appId: string; snapshotId: string };
  'listing:change_detected': { appId: string; field: string; oldValue: string | null; newValue: string | null };
  'listing:draft_generated': { projectId: string; versionId: string; variantCount: number };

  // Competitor events
  'competitor:added': { projectId: string; competitorAppId: string; packageName: string };
  'competitor:removed': { projectId: string; competitorAppId: string };

  // Agent events
  'agent:started': { agent: string; appId?: string; projectId?: string };
  'agent:completed': { agent: string; appId?: string; projectId?: string; durationMs: number };
  'agent:failed': { agent: string; error: string };

  // Worker events
  'worker:job_completed': { worker: string; jobName: string; durationMs: number };
  'worker:job_failed': { worker: string; jobName: string; error: string };

  // Health/alerts
  'health:score_updated': { appId: string; score: number; previousScore: number | null };
  'alert:triggered': { severity: 'info' | 'warning' | 'critical'; title: string; message: string };
}

// ─── Typed Event Bus ───

class TypedEventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Allow many listeners (agents, workers, routes all subscribe)
    this.emitter.setMaxListeners(50);
  }

  on<K extends keyof AppEvents>(event: K, listener: (data: AppEvents[K]) => void): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  once<K extends keyof AppEvents>(event: K, listener: (data: AppEvents[K]) => void): this {
    this.emitter.once(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends keyof AppEvents>(event: K, listener: (data: AppEvents[K]) => void): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  emit<K extends keyof AppEvents>(event: K, data: AppEvents[K]): boolean {
    return this.emitter.emit(event, data);
  }

  listenerCount<K extends keyof AppEvents>(event: K): number {
    return this.emitter.listenerCount(event);
  }

  removeAllListeners<K extends keyof AppEvents>(event?: K): this {
    this.emitter.removeAllListeners(event);
    return this;
  }
}

export const eventBus = new TypedEventBus();

import { db } from '../db/index.js';
import { listingSnapshots } from '../db/schema/listings.js';
import { changeLog } from '../db/schema/changelog.js';
import { eq, desc } from 'drizzle-orm';

// ─── Types ───

export interface DetectedChange {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changeType: 'added' | 'removed' | 'modified';
}

export interface ChangeDetectionResult {
  appId: string;
  changes: DetectedChange[];
  snapshotDate: string;
  previousSnapshotDate: string | null;
}

// Fields to compare between snapshots
const TRACKED_FIELDS = [
  'title',
  'subtitle',
  'shortDesc',
  'longDesc',
  'iconUrl',
  'videoUrl',
  'rating',
  'reviewCount',
  'installsText',
  'version',
  'appSize',
] as const;

type TrackedField = (typeof TRACKED_FIELDS)[number];

// ─── Change Detector ───

export class ChangeDetector {
  /**
   * Compare the two most recent listing snapshots for an app and detect changes.
   */
  async detectChanges(appId: string): Promise<ChangeDetectionResult | null> {
    const snapshots = await db
      .select()
      .from(listingSnapshots)
      .where(eq(listingSnapshots.appId, appId))
      .orderBy(desc(listingSnapshots.snapshotDate))
      .limit(2);

    if (snapshots.length < 2) {
      return null; // Need at least 2 snapshots to compare
    }

    const [current, previous] = snapshots as [typeof snapshots[0], typeof snapshots[0]];
    const changes: DetectedChange[] = [];

    // Compare tracked text fields
    for (const field of TRACKED_FIELDS) {
      const oldVal = this.normalize(previous![field]);
      const newVal = this.normalize(current![field]);

      if (oldVal !== newVal) {
        let changeType: DetectedChange['changeType'] = 'modified';
        if (oldVal === null && newVal !== null) changeType = 'added';
        else if (oldVal !== null && newVal === null) changeType = 'removed';

        changes.push({
          field,
          oldValue: oldVal,
          newValue: newVal,
          changeType,
        });
      }
    }

    // Compare screenshots (JSON array)
    const oldScreenshots = this.parseJsonArray(previous!.screenshotUrls);
    const newScreenshots = this.parseJsonArray(current!.screenshotUrls);

    if (oldScreenshots.length !== newScreenshots.length) {
      changes.push({
        field: 'screenshots',
        oldValue: `${oldScreenshots.length} screenshots`,
        newValue: `${newScreenshots.length} screenshots`,
        changeType: 'modified',
      });
    } else {
      const changed = oldScreenshots.some((url, i) => url !== newScreenshots[i]);
      if (changed) {
        changes.push({
          field: 'screenshots',
          oldValue: `${oldScreenshots.length} screenshots`,
          newValue: `${newScreenshots.length} screenshots (reordered or replaced)`,
          changeType: 'modified',
        });
      }
    }

    return {
      appId,
      changes,
      snapshotDate: current!.snapshotDate ?? new Date().toISOString().split('T')[0]!,
      previousSnapshotDate: previous!.snapshotDate ?? null,
    };
  }

  /**
   * Detect changes and write them to the change_log table.
   * Returns the number of changes logged.
   */
  async detectAndLog(appId: string): Promise<number> {
    const result = await this.detectChanges(appId);
    if (!result || result.changes.length === 0) return 0;

    for (const change of result.changes) {
      await db.insert(changeLog).values({
        appId,
        changeType: change.changeType,
        field: change.field,
        oldValue: change.field === 'longDesc'
          ? (change.oldValue ?? '').slice(0, 500)
          : change.oldValue,
        newValue: change.field === 'longDesc'
          ? (change.newValue ?? '').slice(0, 500)
          : change.newValue,
        source: 'change_detector',
        metadataJson: {
          snapshotDate: result.snapshotDate,
          previousSnapshotDate: result.previousSnapshotDate,
        },
        timestamp: new Date(),
      });
    }

    return result.changes.length;
  }

  /**
   * Summarize what changed in human-readable form.
   */
  summarizeChanges(changes: DetectedChange[]): string {
    if (changes.length === 0) return 'No changes detected.';

    return changes
      .map((c) => {
        switch (c.field) {
          case 'title':
            return `Title: "${c.oldValue}" → "${c.newValue}"`;
          case 'shortDesc':
            return `Short description ${c.changeType}`;
          case 'longDesc':
            return `Description ${c.changeType} (${(c.newValue ?? '').length} chars)`;
          case 'rating':
            return `Rating: ${c.oldValue} → ${c.newValue}`;
          case 'reviewCount':
            return `Reviews: ${c.oldValue} → ${c.newValue}`;
          case 'installsText':
            return `Installs: ${c.oldValue} → ${c.newValue}`;
          case 'version':
            return `Version: ${c.oldValue} → ${c.newValue}`;
          case 'screenshots':
            return `Screenshots: ${c.oldValue} → ${c.newValue}`;
          default:
            return `${c.field}: ${c.changeType}`;
        }
      })
      .join('\n');
  }

  private normalize(val: unknown): string | null {
    if (val === null || val === undefined) return null;
    return String(val).trim();
  }

  private parseJsonArray(val: unknown): string[] {
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {
        // not JSON
      }
    }
    return [];
  }
}

export const changeDetector = new ChangeDetector();

import { isRecord } from "../is-record";
import type { Fixture } from "./fixture";

/** A difference between two fixture sets */
export interface FixtureDiff {
  group: string;
  method: string;
  type: "added" | "removed" | "changed";
  changes?: FieldChange[];
}

/** A specific field that changed */
export interface FieldChange {
  path: string;
  before: unknown;
  after: unknown;
}

/**
 * Compare two fixture sets to detect contract drift.
 *
 * @example
 * ```ts
 * const baseline = loadFixtures("__fixtures__/v1");
 * const current = loadFixtures("__fixtures__/v2");
 * const diffs = diffFixtures(baseline, current);
 * // → [{ group: "users", method: "getAll", type: "changed", changes: [...] }]
 * ```
 */
export function diffFixtures(baseline: Fixture[], current: Fixture[]): FixtureDiff[] {
  const baseMap = toMap(baseline);
  const currMap = toMap(current);
  const diffs: FixtureDiff[] = [];

  // Removed endpoints (in baseline but not in current)
  for (const [key, baseFixture] of baseMap) {
    if (!currMap.has(key)) {
      const [group = "", method = ""] = key.split("/");
      diffs.push({ group, method, type: "removed" });
      continue;
    }

    // Changed endpoints
    const currFixture = currMap.get(key);
    if (!currFixture) continue;

    const changes = diffValues(baseFixture.response.data, currFixture.response.data, "");

    if (changes.length > 0) {
      const [group = "", method = ""] = key.split("/");
      diffs.push({ group, method, type: "changed", changes });
    }
  }

  // Added endpoints (in current but not in baseline)
  for (const key of currMap.keys()) {
    if (!baseMap.has(key)) {
      const [group = "", method = ""] = key.split("/");
      diffs.push({ group, method, type: "added" });
    }
  }

  return diffs;
}

/** Build a map from fixtures, keyed by "group/method" (last fixture wins) */
function toMap(fixtures: Fixture[]): Map<string, Fixture> {
  const map = new Map<string, Fixture>();
  for (const f of fixtures) {
    map.set(`${f.group}/${f.method}`, f);
  }
  return map;
}

/** Recursively diff two values, collecting changed fields */
function diffValues(before: unknown, after: unknown, path: string): FieldChange[] {
  if (before === after) return [];
  if (before === null || after === null || typeof before !== typeof after) {
    return [{ path: path || "(root)", before, after }];
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    return diffArrays(before, after, path);
  }

  if (isRecord(before) && isRecord(after)) {
    return diffObjects(before, after, path);
  }

  return [{ path: path || "(root)", before, after }];
}

function diffObjects(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  path: string,
): FieldChange[] {
  const changes: FieldChange[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const fieldPath = path ? `${path}.${key}` : key;
    if (!(key in before)) {
      changes.push({ path: fieldPath, before: undefined, after: after[key] });
    } else if (!(key in after)) {
      changes.push({ path: fieldPath, before: before[key], after: undefined });
    } else {
      changes.push(...diffValues(before[key], after[key], fieldPath));
    }
  }

  return changes;
}

function diffArrays(before: unknown[], after: unknown[], path: string): FieldChange[] {
  if (before.length !== after.length) {
    return [{ path: `${path}.length`, before: before.length, after: after.length }];
  }

  const changes: FieldChange[] = [];
  for (let i = 0; i < before.length; i++) {
    changes.push(...diffValues(before[i], after[i], `${path}[${i}]`));
  }
  return changes;
}

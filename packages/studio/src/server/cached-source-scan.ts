import { buildSourceScan, type ScanResult } from "./build-source-scan";
import type { LoadedCourierConfig } from "./config-loader";
import type { ImportsSnapshot } from "./imports-bridge";

interface Kept {
  root: string;
  imports: string;
  scan: ScanResult;
}

/* Kept by the config load it scans, and gone with it. */
const kept = new WeakMap<LoadedCourierConfig, Kept>();

/**
 * The source catalogue, as `buildSourceScan` makes it, kept until the config
 * reloads or its imports change. A scan writes every endpoint's schemas out
 * as JSON Schema and works out the tools an agent is offered; for a project
 * of a thousand endpoints that is a quarter of a second, and every page that
 * connects asks for it, as the audit does.
 *
 * @param loaded - The config Studio runs, or `null` when it runs none
 * @param snapshot - Its import declarations, with the imports state as read now
 * @param root - The project root, symlinks resolved
 * @returns Every declared source; none when Studio runs no config
 * @example
 * ```ts
 * const { sources } = cachedSourceScan(running, importsSnapshotOf(running?.config.imports, root), root);
 * ```
 */
export function cachedSourceScan(
  loaded: LoadedCourierConfig | null,
  snapshot: ImportsSnapshot,
  root: string,
): ScanResult {
  if (!loaded) return buildSourceScan(loaded, snapshot, root);
  const imports = JSON.stringify(snapshot);
  const before = kept.get(loaded);
  if (before?.root === root && before.imports === imports) return before.scan;
  const scan = buildSourceScan(loaded, snapshot, root);
  kept.set(loaded, { root, imports, scan });
  return scan;
}

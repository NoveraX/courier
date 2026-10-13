import { cachedSourceScan } from "../cached-source-scan";
import { type ImportSummary, importsSnapshotOf, summarizeImports } from "../imports-bridge";
import { pathScrubber } from "../machine-paths";
import { machineSpellings } from "../machine-spellings";
import type { UpdateChecks } from "../update-checks";
import { emitToPages } from "./emit-to-pages";
import type { ProjectEventTarget, ProjectSnapshot } from "./types";

/**
 * Send the imports list and the source catalogue of the project Studio runs:
 * `registry:updated`, then `scan:sources`. Both are built from `snapshot`
 * and the imports state as read now, before either is sent, so a failure to
 * build them sends neither.
 *
 * Why an import's last update check failed can name a path of this
 * machine — a config that does not load says where — so a page without the
 * project's token is told it with the project's paths relative to it and
 * any other under the home directory from `~`.
 *
 * Synchronous on purpose, and it must stay so: the UI takes the order its
 * packets arrive in as the order of the project's states, and socket.io
 * writes each socket's packets in the order they are sent. An `await` here
 * would let a later outcome overtake an earlier one.
 *
 * @param target - Every UI, or the one that connected
 * @param snapshot - The project as Studio runs it
 * @param root - The project root, symlinks resolved
 * @param checks - The last update check of each import
 * @throws What reading the imports state or building the catalogue throws
 *
 * @example
 * ```ts
 * sendImportLists(socket, project.snapshot(), root, project.updateChecks);
 * ```
 */
export function sendImportLists(
  target: ProjectEventTarget,
  snapshot: ProjectSnapshot,
  root: string,
  checks: UpdateChecks,
): void {
  const imports = importsSnapshotOf(snapshot.running?.config.imports, root);
  const registry = { sources: summarizeImports(imports, checks) };
  const scan = cachedSourceScan(snapshot.running, imports, root);
  emitToPages(target, "registry:updated", registry, withoutMachinePaths(registry, root));
  target.emit("scan:sources", scan);
}

/* The same list when no check's failure names a path, so every page is sent one message. */
function withoutMachinePaths(
  registry: { sources: ImportSummary[] },
  root: string,
): { sources: ImportSummary[] } {
  if (!registry.sources.some((source) => source.check?.error !== undefined)) return registry;
  const scrub = pathScrubber(machineSpellings({ project: [root] }));
  const sources = registry.sources.map((source) => shownSource(source, scrub));
  return sources.every((source, n) => source === registry.sources[n]) ? registry : { sources };
}

function shownSource(source: ImportSummary, scrub: (text: string) => string): ImportSummary {
  const { check } = source;
  if (check?.error === undefined) return source;
  const error = scrub(check.error);
  return error === check.error ? source : { ...source, check: { ...check, error } };
}

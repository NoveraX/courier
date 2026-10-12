import { cachedSourceScan } from "../cached-source-scan";
import { importsSnapshotOf, summarizeImports } from "../imports-bridge";
import type { UpdateChecks } from "../update-checks";
import type { ProjectEventTarget, ProjectSnapshot } from "./types";

/**
 * Send the imports list and the source catalogue of the project Studio runs:
 * `registry:updated`, then `scan:sources`. Both are built from `snapshot`
 * and the imports state as read now, before either is sent, so a failure to
 * build them sends neither.
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
  target.emit("registry:updated", registry);
  target.emit("scan:sources", scan);
}

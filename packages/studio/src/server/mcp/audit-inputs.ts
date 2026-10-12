import { buildSourceScan, type ScannedSource } from "../build-source-scan";
import { importsSnapshotOf } from "../imports-bridge";
import type { ProjectState } from "../project-state/types";
import { runtimeRegistry } from "../runtime-namespace-state";
import type { StudioAuditInputs } from "./audit-tool";

/**
 * What Studio's audit reads besides the requests, as Studio holds it when
 * the audit runs: the sources the config declares, scanned as a page is
 * sent them, and the runtimes attached now with where each runs. A scan
 * writes every endpoint's schemas out as JSON Schema, which for a project
 * of a thousand endpoints takes tens of milliseconds, so it is kept until
 * the config reloads or its imports change.
 *
 * @param project - The project Studio runs
 * @param root - The project's root, links resolved
 * @returns The audit's inputs
 * @example
 * ```ts
 * auditTool({ ...auditInputsOf(project, root), requestLog });
 * ```
 */
export function auditInputsOf(
  project: Pick<ProjectState, "snapshot">,
  root: string,
): Pick<StudioAuditInputs, "declared" | "runtimes"> {
  let scanned: { running: unknown; imports: string; sources: readonly ScannedSource[] } | undefined;
  return {
    declared: () => {
      const { running } = project.snapshot();
      const snapshot = importsSnapshotOf(running?.config.imports, root);
      const imports = JSON.stringify(snapshot.state);
      if (scanned === undefined || scanned.running !== running || scanned.imports !== imports) {
        scanned = { running, imports, sources: buildSourceScan(running, snapshot, root).sources };
      }
      return scanned.sources;
    },
    runtimes: () =>
      [...runtimeRegistry.values()].map(({ runtimeId, kind }) => ({ runtimeId, kind })),
  };
}

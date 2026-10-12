import { cachedSourceScan } from "../cached-source-scan";
import { importsSnapshotOf } from "../imports-bridge";
import type { ProjectState } from "../project-state/types";
import { runtimeRegistry } from "../runtime-namespace-state";
import type { StudioAuditInputs } from "./audit-tool";

/**
 * What Studio's audit reads besides the requests, as Studio holds it when
 * the audit runs: the sources the config declares, scanned as a page is
 * sent them — kept until the config reloads or its imports change — and the
 * runtimes attached now with where each runs.
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
  return {
    declared: () => {
      const { running } = project.snapshot();
      return cachedSourceScan(running, importsSnapshotOf(running?.config.imports, root), root)
        .sources;
    },
    runtimes: () =>
      [...runtimeRegistry.values()].map(({ runtimeId, kind }) => ({ runtimeId, kind })),
  };
}

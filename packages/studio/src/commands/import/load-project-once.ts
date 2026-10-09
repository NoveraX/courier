import { type LoadedCourierConfig, loadCourierConfig } from "../../server/config-loader";
import { exclusiveContext } from "../../server/exclusive-context";
import { failureOf } from "../../server/project-state/failure-of";
import type { ProjectSnapshot, ProjectState } from "../../server/project-state/types";
import { createUpdateChecks } from "../../server/update-checks";

async function outcome(root: string, revision: number): Promise<ProjectSnapshot> {
  try {
    const running = await loadCourierConfig(root);
    return { revision, starting: false, running, loadedAt: Date.now(), failure: null };
  } catch (error) {
    return {
      revision,
      starting: false,
      running: null,
      loadedAt: null,
      failure: failureOf(error, root),
    };
  }
}

/**
 * The project as one run of a command sees it: its config loaded from disk
 * as the run starts, and loaded again by an edit that checks what it wrote —
 * the project Studio's server keeps, read once instead of watched, with no
 * page to tell. A config that does not load is reported as the server's
 * routes report it.
 *
 * @param root - The project root, symlinks resolved
 * @returns The project, its first load done
 * @example
 * ```ts
 * const project = await loadProjectOnce(root);
 * await writeImport(body, { project, projectRoot: root });
 * ```
 */
export async function loadProjectOnce(root: string): Promise<ProjectState> {
  let current = await outcome(root, 1);
  const apply = (running: LoadedCourierConfig) => {
    current = {
      ...current,
      revision: current.revision + 1,
      running,
      loadedAt: Date.now(),
      failure: null,
    };
  };
  const host = {
    current: () => current.running,
    load: () => loadCourierConfig(root),
    apply,
    acknowledge: () => {},
    reloadAfter: () => {},
    isStopped: () => false,
  };
  return {
    snapshot: () => current,
    fresh: async () => ({ ...current, settling: false }),
    importsChanged: () => {},
    updateChecks: createUpdateChecks(),
    runExclusive: (transaction, timeoutMs) => transaction(exclusiveContext(host, timeoutMs)),
    finishEdits: async () => {},
    stop: () => {},
  };
}

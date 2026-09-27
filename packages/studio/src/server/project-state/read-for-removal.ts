import type { LoadedCourierConfig } from "../config-loader";
import type { ImportDeclarations } from "../imports-bridge";
import { SHOW_BUDGET_MS } from "./budgets";
import { readDeclarations } from "./read-declarations";
import type { ProjectReads } from "./types";

/** What removing an import reads of the project. */
export interface RemovalView {
  /** The import declarations, as {@link readDeclarations} gives them to `forget`. */
  imports: ImportDeclarations;
  /** The config Studio runs, whose inputs a removal may take away; `null` while none runs. */
  running: LoadedCourierConfig | null;
}

/**
 * Read what removing an import needs: the declarations, which removing
 * never waits on the config to load for, and the config Studio runs, so the
 * removal can say which of the files it takes away that config imports.
 *
 * @param project - The project Studio runs
 * @param root - The project root, symlinks resolved
 * @returns The declarations and the running config
 * @throws {ProjectUnavailableError} While Studio is starting
 * @example
 * ```ts
 * const { imports, running } = await readForRemoval(project, root);
 * ```
 */
export async function readForRemoval(project: ProjectReads, root: string): Promise<RemovalView> {
  const imports = await readDeclarations(project, root, "forget");
  const { running } = await project.fresh(SHOW_BUDGET_MS);
  return { imports, running };
}

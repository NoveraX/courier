import type { Narrowing } from "./policy/checked-policy";
import { checkSourceNames } from "./project/check-source-names";
import { loadEnvFiles } from "./project/load-env-files";
import { projectPolicy } from "./project/project-policy";
import { buildCatalog, type Catalog } from "./tools/catalog";

/** Which project `courier-mcp --list` reads, and what its start would narrow. */
export interface ListedProject {
  /** The project's root, where `courier.config.*` is. */
  readonly root: string;
  /** The sources to list, by name; every one when absent. */
  readonly only?: readonly string[] | undefined;
  /** Files of environment variables to load first, relative to the root. */
  readonly envFiles?: readonly string[] | undefined;
  /** What `--read-only` and `--deny` would narrow the policy by. */
  readonly narrowing?: Narrowing | undefined;
}

/**
 * The tools a project offers to agents, and what its `agents` policy
 * decided for every endpoint — read from its config without starting a
 * server or reaching Studio, for `courier-mcp --list` and a CI step.
 *
 * @param options - The project, which sources, and what the start would narrow
 * @returns The catalog
 * @throws Error when the project has no config or no sources;
 *   ConfigurationError for a policy or a marked tool that cannot be offered
 * @example
 * ```ts
 * const catalog = await listProject({ root: process.cwd() });
 * catalog.tools.length;
 * ```
 */
export async function listProject(options: ListedProject): Promise<Catalog> {
  loadEnvFiles(options.root, options.envFiles);
  const { loadCourierConfig } = await import("@noverax/courier-studio-core/config");
  const loaded = await loadCourierConfig({ cwd: options.root });
  const sources = loaded?.config.sources;
  checkSourceNames(sources, options.root, options.only);
  const policy = projectPolicy(() => loaded?.config, options.narrowing ?? {});
  return buildCatalog(sources, { only: options.only, policy: policy() });
}

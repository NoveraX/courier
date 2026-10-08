import type { ProjectReads } from "../project-state/types";
import { type SessionEnvironment, sessionEnvironment } from "./session-environment";

/**
 * The environment the project runs in now, read each time it is asked for:
 * the sources the config has then, and — unless Studio serves a public demo
 * — the machine it runs on.
 *
 * @param root - The project root
 * @param project - The project as Studio runs it
 * @param options - Whether the machine is named (`host`)
 * @returns What reads the environment
 * @example
 * ```ts
 * const environment = projectEnvironment(root, project, { host: true });
 * environment().definitions;
 * ```
 */
export function projectEnvironment(
  root: string,
  project: Pick<ProjectReads, "snapshot">,
  { host }: { host: boolean },
): () => SessionEnvironment {
  return () => sessionEnvironment(root, project.snapshot().running?.config.sources ?? {}, { host });
}

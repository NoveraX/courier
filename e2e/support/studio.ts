import { join } from "node:path";
import { freePort } from "./free-port";
import { type Started, startProcess } from "./process";
import { REPO } from "./project";

const CLI = join(REPO, "packages/studio/lib/cli.js");

/** Studio, as a developer starts it over the project. */
export interface Studio extends Started {
  /** The link Studio prints, with the token a page acts with. */
  link: string;
  /** Where Studio's own mocks start listening. */
  mockPort: number;
  /** The environment the project's own processes are started with, to find Studio. */
  env: Record<string, string>;
}

/**
 * Start Studio from its command line over a project, on ports of its own,
 * and wait for the link it prints.
 *
 * @param root - The project
 * @param env - More of the project's environment, such as its upstream
 * @returns Studio
 * @example
 * ```ts
 * const studio = await startStudio(project.root);
 * await page.goto(studio.link);
 * ```
 */
export async function startStudio(root: string, env: Record<string, string> = {}): Promise<Studio> {
  const [studioPort, mockPort] = [await freePort(), await freePort()];
  const projectEnv = {
    ...env,
    COURIER_E2E_STUDIO_PORT: String(studioPort),
    COURIER_E2E_MOCK_PORT: String(mockPort),
  };
  const started = await startProcess([process.execPath, CLI, "--no-open"], {
    cwd: root,
    env: projectEnv,
    ready: /http:\/\/localhost:\d+\/#token=\S+/,
  });
  return { ...started, link: started.ready, mockPort, env: projectEnv };
}

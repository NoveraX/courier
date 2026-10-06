import { freePort } from "./free-port";
import { type Started, startProcess } from "./process";

/**
 * Start the project's app: its own server, attached to Studio, which hosts
 * the shop, so the Playground can send through it.
 *
 * @param root - The project
 * @param env - The project's environment, which tells it where Studio is
 * @returns The process
 * @example
 * ```ts
 * const runtime = await startRuntime(project.root, studio.env);
 * ```
 */
export async function startRuntime(root: string, env: Record<string, string>): Promise<Started> {
  return startProcess([process.execPath, "--import", "tsx", "src/runtime.ts"], {
    cwd: root,
    env: { ...env, COURIER_E2E_APP_PORT: String(await freePort()) },
    ready: /app ready/,
  });
}

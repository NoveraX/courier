import { freePort } from "../../support/free-port";
import { startProcess } from "../../support/process";
import { startApi } from "./api";
import { APPS } from "./apps";
import { startAttacker } from "./attacker";
import { prepare } from "./prepare";
import { targetOf } from "./targets";

/**
 * Build and serve the application of the target `COURIER_FRAMEWORK` names,
 * beside the API it calls and another site that links to it. The checks
 * read their addresses from the environment.
 *
 * @returns What stops them all again
 * @example
 * ```ts
 * // playwright.config.ts
 * export default defineConfig({ globalSetup: "./support/global-setup.ts" });
 * ```
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const target = targetOf(process.env.COURIER_FRAMEWORK);
  const settings = APPS[target.app];
  const port = await freePort();
  const address = settings.address(port);
  const api = await startApi(address);
  const attacker = await startAttacker();
  const root = await prepare(target, api.url);
  const app = await startProcess(settings.start(port), {
    cwd: root,
    env: settings.env(port),
    ready: settings.ready,
    timeoutMs: 120_000,
  });
  process.env.COURIER_APP_URL = address;
  process.env.COURIER_API_URL = api.url;
  process.env.COURIER_ATTACKER_URL = attacker.url;
  return async () => {
    await app.stop();
    await attacker.close();
    await api.close();
  };
}

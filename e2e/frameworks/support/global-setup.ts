import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { freePort } from "../../support/free-port";
import { startProcess } from "../../support/process";
import { startApi } from "./api";
import { APPS, type AppSettings, type Serving } from "./apps";
import { startAttacker } from "./attacker";
import { prepare, TELEMETRY_OFF } from "./prepare";
import { type Target, targetOf } from "./targets";

/** Whether the run serves the application with its dev server rather than its build. */
export const UNDER_DEV = process.env.COURIER_FRAMEWORK_MODE === "dev";

/* Where each application's output is kept, one log per framework version, until its next run. */
const LOGS = join(import.meta.dirname, "../../../node_modules/.cache/courier-frameworks/logs");

/**
 * Build and serve the application of the target `COURIER_FRAMEWORK` names,
 * beside the API it calls and another site that links to it — or, when
 * `COURIER_FRAMEWORK_MODE` is `dev`, serve it with its dev server unbuilt.
 * The checks read their addresses, and the application's folder, from the
 * environment; what the application prints is kept in a log, named before
 * the checks start.
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
  const attacker = await startAttacker(address);
  const root = await prepare(target, api.url, { build: !UNDER_DEV });
  mkdirSync(LOGS, { recursive: true });
  const log = join(LOGS, `${target.id}${UNDER_DEV ? "-dev" : ""}.log`);
  const serving = UNDER_DEV ? devServing(target, settings) : settings.serve;
  const app =
    serving === undefined
      ? undefined
      : await startProcess(serving.start(port), {
          cwd: root,
          env: serving.env(port),
          ready: serving.ready,
          timeoutMs: 120_000,
          log,
        });
  if (app !== undefined) console.log(`The application's output: ${log}`);
  process.env.COURIER_APP_URL = address;
  process.env.COURIER_APP_ROOT = root;
  process.env.COURIER_API_URL = api.url;
  process.env.COURIER_ATTACKER_URL = attacker.url;
  return async () => {
    await app?.stop();
    await attacker.close();
    await api.close();
  };
}

/* The dev server, on the address the checks open, unbuilt and as development. */
function devServing(target: Target, settings: AppSettings): Serving {
  const command = target.dev ?? settings.dev?.command;
  if (command === undefined || settings.dev === undefined) {
    throw new Error(`${target.id} has no dev server to check`);
  }
  const address =
    settings.dev.address ?? ((port) => ["--host", "127.0.0.1", "--port", String(port)]);
  return {
    start: (port) => [...command, ...address(port)],
    env: () => ({ ...TELEMETRY_OFF, NODE_ENV: "development" }),
    ready: settings.dev.ready,
  };
}

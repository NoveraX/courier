import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { serveRegistry } from "./registry";

/**
 * Serve Courier's packages, built and packed, as the `@noverax` scope's
 * registry for every command the check runs — npx, the install, the
 * generator's — with a cache of its own, so nothing a run before left
 * is taken for a package of this build.
 *
 * @returns How to stop the registry and remove what it served
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const work = mkdtempSync(join(tmpdir(), "courier-quickstart-"));
  const registry = await serveRegistry(join(work, "tarballs"));
  process.env["npm_config_@noverax:registry"] = registry.url;
  process.env.npm_config_cache = join(work, "npm-cache");
  process.env.npm_config_fund = "false";
  process.env.npm_config_audit = "false";
  process.env.npm_config_update_notifier = "false";
  process.env.COURIER_QUICKSTART_WORK = work;
  return async () => {
    await registry.close();
    /* A dev server's last writes may still be landing as its process exits. */
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  };
}

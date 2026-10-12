import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { stopRunningFrom } from "./processes";
import { serveRegistry } from "./registry";

/**
 * Serve Courier's packages, built and packed, as the `@noverax` scope's
 * registry for every command the check runs — npx, the install, the
 * generator's — with a cache of its own, so nothing a run before left
 * is taken for a package of this build. The scope's registry is named in
 * an npm configuration file of the check's own: a variable named after it
 * holds an `@` and a `:`, and the shell npx runs a command through on
 * Linux drops such a variable. A generator that commits the project it
 * made is given an author. When the check ends, whatever still runs from
 * its projects is stopped before they are removed.
 *
 * @returns How to stop the registry and remove what it served
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const work = mkdtempSync(join(tmpdir(), "courier-quickstart-"));
  const registry = await serveRegistry(join(work, "tarballs"));
  const npmrc = join(work, "npmrc");
  writeFileSync(npmrc, `@noverax:registry=${registry.url}\n`);
  process.env.npm_config_userconfig = npmrc;
  process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = "Courier quickstart";
  process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = "quickstart@courier.invalid";
  process.env.npm_config_cache = join(work, "npm-cache");
  process.env.npm_config_fund = "false";
  process.env.npm_config_audit = "false";
  process.env.npm_config_update_notifier = "false";
  process.env.COURIER_QUICKSTART_WORK = work;
  return async () => {
    await stopRunningFrom(work);
    await registry.close();
    /* A dev server's last writes may still be landing as its process exits. */
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  };
}

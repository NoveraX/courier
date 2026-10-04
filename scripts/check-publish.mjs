/**
 * Lint every package as npm would publish it.
 *
 * publint reads each manifest against the files `npm pack` would ship; attw
 * resolves each export's JavaScript and types as Node and bundlers do. The
 * packages are ES modules only, so attw leaves CommonJS resolution out
 * (`--profile esm-only`); the installation guide says how CommonJS loads
 * them. Every message publint reports, a suggestion included, fails the
 * check, so the baseline stays empty and a new rule's finding is read rather
 * than scrolled past.
 *
 * Run it after a build: both read the built files.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { publint } from "publint";
import { formatMessage } from "publint/utils";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ATTW_MANIFEST = createRequire(import.meta.url).resolve("@arethetypeswrong/cli/package.json");
const ATTW = join(dirname(ATTW_MANIFEST), JSON.parse(readFileSync(ATTW_MANIFEST, "utf8")).bin.attw);

/** Every package directory under packages/ that npm would publish. */
function publishedPackages() {
  const parent = join(ROOT, "packages");
  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(parent, entry.name))
    .filter((dir) => existsSync(join(dir, "package.json")))
    .filter((dir) => JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).private !== true);
}

/** What publint says of one package, one line per message. */
async function publintProblems(pkgDir) {
  const { messages, pkg } = await publint({ pkgDir, level: "suggestion", pack: "npm" });
  return messages.map(
    (message) =>
      `${message.type}: ${formatMessage(message, pkg, { color: false }) ?? message.code}`,
  );
}

/** What attw says of one package, as it prints it; nothing when it passes. */
function attwProblems(pkgDir) {
  const result = spawnSync(
    process.execPath,
    [ATTW, "--pack", pkgDir, "--profile", "esm-only", "--format", "ascii"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return result.status === 0 ? [] : [`${result.stdout}${result.stderr}`.trim()];
}

let failed = 0;
for (const pkgDir of publishedPackages()) {
  const problems = [...(await publintProblems(pkgDir)), ...attwProblems(pkgDir)];
  const name = relative(ROOT, pkgDir);
  if (problems.length === 0) {
    console.log(`check-publish: ${name} ok`);
    continue;
  }
  failed += 1;
  console.error(`check-publish: ${name}\n  ${problems.join("\n  ")}`);
}
if (failed > 0) {
  console.error(`check-publish: ${failed} package(s) would publish with problems`);
  process.exit(1);
}

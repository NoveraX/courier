/**
 * Release driver invoked by semantic-release's exec plugin.
 *
 * Usage:
 *   tsx scripts/release.ts prepare <version>
 *   tsx scripts/release.ts publish <version>
 *
 * Publishing a workspace is not a loop over a directory listing. A package
 * must reach the registry after everything it depends on, or there is a window
 * — and on a failed run, a permanent state — where installing it cannot
 * resolve. And because a release tags the repository before the last package
 * lands, a run that dies halfway can never be retried by re-releasing: the
 * tag is already there and semantic-release finds nothing new to do. So the
 * publish step has to be safe to simply run again.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { packageDirs, publishOrder, readPkg, SCOPE } from "./release-order";

export function updateVersion(pkgDir: string, ver: string): void {
  const pkg = readPkg(pkgDir);
  pkg.version = ver;

  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    if (dep.startsWith(SCOPE)) (pkg.dependencies as Record<string, string>)[dep] = ver;
  }

  writeFileSync(join(pkgDir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
}

/** Whether this exact version is already on the registry. */
export function isPublished(name: string, ver: string): boolean {
  try {
    const out = execFileSync("npm", ["view", `${name}@${ver}`, "version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim() === ver;
  } catch {
    /* Absent, or the registry did not answer. Either way we try to publish,
       and a real failure is collected below rather than guessed at here. */
    return false;
  }
}

function prepare(version: string, dirs: readonly string[]): void {
  for (const dir of dirs) updateVersion(dir, version);
  for (const dir of dirs) copyFileSync("LICENSE", join(dir, "LICENSE"));
  execFileSync("npx", ["turbo", "run", "build"], { stdio: "inherit" });
  console.log(`Prepared v${version} (${dirs.length} packages)`);
}

/**
 * Publish every package, skipping the ones already on the registry.
 *
 * A failure is recorded rather than thrown, because the operator's next
 * decision depends on the state of all of them, not on the first one to break.
 */
function publish(version: string, dirs: readonly string[]): void {
  const published: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const dir of dirs) {
    const { name } = readPkg(dir);

    if (isPublished(name, version)) {
      skipped.push(name);
      console.log(`- ${name}@${version} already on the registry`);
      continue;
    }

    try {
      execFileSync("npm", ["publish", dir, "--access", "public"], { stdio: "inherit" });
      published.push(name);
    } catch (error) {
      failed.push(name);
      console.error(`x ${name}@${version} failed:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(
    `v${version}: ${published.length} published, ${skipped.length} already there, ${failed.length} failed`,
  );

  if (failed.length > 0) {
    console.error(
      `Not published: ${failed.join(", ")}.\n` +
        "Re-run once the cause is fixed; packages already on the registry are skipped.",
    );
    process.exit(1);
  }
}

function main(argv: readonly string[]): void {
  const [command, version] = argv;

  if (command !== "prepare" && command !== "publish") {
    console.error("Usage: tsx scripts/release.ts <prepare|publish> <version>");
    process.exit(1);
  }
  if (!version) {
    console.error(`Missing version: tsx scripts/release.ts ${command} <version>`);
    process.exit(1);
  }

  const dirs = publishOrder(packageDirs());
  if (command === "prepare") prepare(version, dirs);
  else publish(version, dirs);
}

/* Importing this module must not release anything — the ordering is covered
   by tests, and a test run is an import. */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}

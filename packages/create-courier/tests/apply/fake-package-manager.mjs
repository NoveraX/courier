/**
 * A package manager for the tests to install with, run as `node
 * fake-package-manager.mjs <behaviour> <dev|prod> <package...>` in the
 * project's folder, as the real one runs there:
 *
 * - `ok` lists each package in package.json, as npm does, writes the
 *   lockfile and ends well;
 * - `fail` writes nothing and ends with status 1, as an unreachable
 *   registry leaves an install;
 * - `fail-after-writing` writes as `ok` does, then ends with status 1;
 * - `lock` writes the lockfile of what package.json lists, as `npm
 *   install` does with no package named;
 * - `hang=<file>` writes that file, outside the project, and waits until
 *   it is stopped.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [behaviour, kind, ...packages] = process.argv.slice(2);

function write() {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const field = kind === "dev" ? "devDependencies" : "dependencies";
  manifest[field] = { ...manifest[field] };
  for (const spec of packages) {
    const at = spec.indexOf("@", 1);
    manifest[field][at === -1 ? spec : spec.slice(0, at)] =
      at === -1 ? "^1.0.0" : spec.slice(at + 1);
  }
  writeFileSync("package.json", `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    "package-lock.json",
    `${JSON.stringify({ lockfileVersion: 3, packages }, null, 2)}\n`,
  );
}

if (behaviour === "ok") write();
else if (behaviour === "lock") {
  const listed = JSON.parse(readFileSync("package.json", "utf8")).dependencies ?? {};
  writeFileSync(
    "package-lock.json",
    `${JSON.stringify({ lockfileVersion: 3, listed }, null, 2)}\n`,
  );
} else if (behaviour === "fail") process.exitCode = 1;
else if (behaviour === "fail-after-writing") {
  write();
  process.exitCode = 1;
} else if (behaviour?.startsWith("hang=")) {
  writeFileSync(behaviour.slice("hang=".length), "");
  setInterval(() => {}, 60_000);
} else throw new Error(`No behaviour ${behaviour}`);

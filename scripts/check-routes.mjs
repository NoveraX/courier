/// <reference types="node" />
/**
 * Check that every routes module the repository keeps is the one Studio
 * writes from its project's `.expose()` marks, with `courier-studio routes
 * --check`, so a mark changed without the module written again fails here
 * rather than in a page. The projects are the examples and the docs site.
 *
 * Requires a build first. Exits 1 when a module is out of date.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLI = join(ROOT, "packages/studio/lib/cli.js");

/** The projects whose routes module the repository keeps. */
const PROJECTS = ["examples/basic", "examples/demo-shop", "docs"];

const stale = PROJECTS.filter((project) => {
  const run = spawnSync(
    process.execPath,
    [CLI, "routes", "--check", "--cwd", join(ROOT, project)],
    {
      stdio: "inherit",
    },
  );
  return run.status !== 0;
});

if (stale.length > 0) {
  console.error(
    `check-routes: the routes module of ${stale.join(", ")} is not what its marks give; run \`npm run routes\` there`,
  );
  process.exit(1);
}
console.log(`check-routes: the routes modules of ${PROJECTS.length} projects match their marks`);

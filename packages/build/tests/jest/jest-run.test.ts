/**
 * @vitest-environment node
 *
 * Jest itself, with the transformer on the module `@noverax/courier/routes`
 * ships: a test that requires the routes and one that imports them as an
 * ES module both get those of the config, and a run after an edit gets the
 * edited ones, whatever Jest kept. Requires a build of this package and of
 * the core first.
 */
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { TempProject } from "../vite/temp-project";
import { jsProject } from "../webpack/js-project";

const require = createRequire(import.meta.url);

const JEST = join(dirname(require.resolve("jest/package.json")), "bin/jest.js");

/* The module the package ships, by the real path Jest resolves it to: in this
   repository the core is linked from its folder, not installed under
   node_modules, where an app's pattern finds it. */
const STUB = realpathSync(require.resolve("@noverax/courier/routes"));

const JEST_CONFIG = `module.exports = {
  transform: { ${JSON.stringify(`${STUB.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)}: "@noverax/courier-build/jest" },
  transformIgnorePatterns: ["/node_modules/(?!@noverax/courier/)"],
  testEnvironment: "node",
  cacheDirectory: "<rootDir>/.jest-cache",
};
`;

/* A test of each module system, each printing the routes it was handed. */
const REQUIRING = `const { routes } = require("@noverax/courier/routes");
test("routes", () => { console.log("ROUTES " + JSON.stringify(routes)); });
`;
const IMPORTING = `import { routes } from "@noverax/courier/routes";
test("routes", () => { console.log("ROUTES " + JSON.stringify(routes)); });
`;

let project: TempProject | undefined;

afterEach(() => {
  project?.remove();
  project = undefined;
});

/* Jest's output for a run of one test, as ES modules or not. */
function jest(root: string, test: string, esm: boolean): { status: number | null; output: string } {
  const run = spawnSync(process.execPath, [JEST, "--rootDir", root, "--ci", test], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: esm ? "--experimental-vm-modules" : "" },
  });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

describe("Jest with the routes transformer", () => {
  it("hands a test that requires the routes those of the config, and one after an edit the edited ones", () => {
    project = jsProject({ "jest.config.cjs": JEST_CONFIG, "tests/routes.test.cjs": REQUIRING });

    const first = jest(project.root, "tests/routes.test.cjs", false);
    project.edit("src/apis.mjs", (code) =>
      code.replace('view: endpoint.get("cart")', 'view: endpoint.get("cart").expose()'),
    );
    const edited = jest(project.root, "tests/routes.test.cjs", false);

    expect(first.status).toBe(0);
    expect(first.output).toContain('"cart.add":{"type":"mutation"}');
    expect(first.output).not.toContain('"cart.view"');
    expect(edited.status).toBe(0);
    expect(edited.output).toContain('"cart.view":{"type":"query"}');
  }, 120_000);

  it("hands a test run as an ES module the routes as one", () => {
    project = jsProject({ "jest.config.cjs": JEST_CONFIG, "tests/routes.test.mjs": IMPORTING });

    const run = jest(project.root, "tests/routes.test.mjs", true);

    expect(run.status).toBe(0);
    expect(run.output).toContain('"cart.add":{"type":"mutation"}');
  }, 120_000);
});

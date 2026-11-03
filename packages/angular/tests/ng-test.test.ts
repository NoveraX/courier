/**
 * @vitest-environment node
 *
 * `ng test` with Courier's unit-test builder, Angular's Vitest runner under
 * it: a test that takes the routes gets those of the config. Requires a
 * build of this package, of `@noverax/courier-build` and of the core first.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { type AngularProject, angularProject } from "./angular-project";

const NG = join(
  dirname(createRequire(import.meta.url).resolve("@angular/cli/package.json")),
  "bin/ng.js",
);

/* A test of the routes, as an app's spec takes them. */
const ROUTES_SPEC = `import { routes } from "@noverax/courier/routes";
import { expect, test } from "vitest";

test("the cart opens add alone", () => {
  expect(Object.keys(routes.shop.endpoints)).toEqual(["cart.add"]);
});
`;

let project: AngularProject | undefined;

afterEach(() => {
  project?.remove();
  project = undefined;
});

/* The project, with a test target of Courier's builder and a spec of the routes. */
function testedProject(spec: string): AngularProject {
  const tested = angularProject({
    "tsconfig.spec.json":
      '{ "extends": "./tsconfig.json", "files": ["courier-env.d.ts"], "include": ["src/**/*.spec.ts"] }\n',
    "src/routes.spec.ts": spec,
  });
  const workspace = join(tested.root, "angular.json");
  const angular: unknown = JSON.parse(readFileSync(workspace, "utf8"));
  const architect: unknown = Reflect.get(
    Reflect.get(Reflect.get(Object(angular), "projects"), "app"),
    "architect",
  );
  Reflect.set(Object(architect), "test", {
    builder: "@noverax/courier-angular:unit-test",
    options: { buildTarget: "app:build", tsConfig: "tsconfig.spec.json", runner: "vitest" },
  });
  writeFileSync(workspace, `${JSON.stringify(angular, null, 2)}\n`);
  return tested;
}

/* What `ng test` printed, run once. */
function ngTest(root: string): { status: number | null; output: string } {
  const run = spawnSync(process.execPath, [NG, "test", "--watch=false"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NG_CLI_ANALYTICS: "false", CI: "1" },
  });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

describe("ng test with Courier's unit-test builder", () => {
  it("hands a test the routes of the config", () => {
    project = testedProject(ROUTES_SPEC);

    const tested = ngTest(project.root);

    expect(tested.status, tested.output).toBe(0);
  }, 240_000);

  it("fails a test whose routes are not those of the config, so the run is the routes' own", () => {
    project = testedProject(ROUTES_SPEC.replace('["cart.add"]', '["cart.view"]'));

    const tested = ngTest(project.root);

    expect(tested.status).not.toBe(0);
  }, 240_000);
});

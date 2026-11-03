/**
 * @vitest-environment node
 *
 * Angular's CLI with Courier's builders: `ng build` builds the routes of
 * every source into the page and nothing of the module the package ships,
 * fails while the config cannot be read, and fails a page that takes the
 * config itself. Requires a build of this package, of
 * `@noverax/courier-build` and of the core first.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ADD_OPEN, type AngularProject, angularProject } from "./angular-project";

const NG = join(
  dirname(createRequire(import.meta.url).resolve("@angular/cli/package.json")),
  "bin/ng.js",
);

let project: AngularProject | undefined;

afterEach(() => {
  project?.remove();
  project = undefined;
});

/* What `ng build` printed, and the scripts it wrote. */
function ngBuild(root: string): { status: number | null; output: string; code: string } {
  const run = spawnSync(process.execPath, [NG, "build"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NG_CLI_ANALYTICS: "false", CI: "1" },
  });
  const dist = join(root, "dist");
  const scripts = run.status === 0 ? readdirSync(dist).filter((name) => name.endsWith(".js")) : [];
  return {
    status: run.status,
    output: `${run.stdout}${run.stderr}`,
    code: scripts.map((name) => readFileSync(join(dist, name), "utf8")).join("\n"),
  };
}

describe("ng build with Courier's application builder", () => {
  it("builds the routes of every source into the page, and nothing of the module the package ships", () => {
    project = angularProject();

    const built = ngBuild(project.root);

    expect(built.status, built.output).toBe(0);
    expect(built.code.replace(/\s/g, "")).toMatch(ADD_OPEN);
    expect(built.code).not.toContain("ROUTES_NOT_BUILT");
    expect(built.code).not.toContain("shop.example.com");
  }, 180_000);

  it("fails while the config cannot be read, with why", () => {
    project = angularProject({ "src/apis.ts": "export const shop = ;\n" });

    const built = ngBuild(project.root);

    expect(built.status).not.toBe(0);
    expect(built.output).toContain("[courier]");
  }, 180_000);

  it("fails a page that takes the config itself", () => {
    project = angularProject({
      "src/main.ts": 'import config from "../courier.config";\n\nconsole.log(config);\n',
    });

    const built = ngBuild(project.root);

    expect(built.status).not.toBe(0);
    expect(built.output).toContain("courier.config.ts is imported into a page as a value");
  }, 180_000);
});

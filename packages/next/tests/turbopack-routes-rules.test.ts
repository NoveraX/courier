/**
 * @vitest-environment node
 *
 * Turbopack's rules for the routes: the module the package ships matched
 * wherever a package manager installs it, a core linked into the app from
 * a folder of its own matched by its path from the root, and the config
 * matched by its path, or by its name when it lies above the app.
 * Requires a build of `@noverax/courier-build` first.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RoutesProject } from "@noverax/courier-build/webpack";
import { afterEach, describe, expect, it } from "vitest";

import { turbopackRoutesRules } from "../src/turbopack-routes-rules";

const STUB_GLOB = "**/node_modules/@noverax/courier/lib/routes/index.js";
const NEXT_16 = { major: 16, minor: 4 };

let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function project(fields: Partial<RoutesProject> & { root: string }): RoutesProject {
  return {
    stubFile: join(fields.root, "node_modules/@noverax/courier/lib/routes/index.js"),
    ...fields,
  };
}

describe("turbopackRoutesRules", () => {
  it("matches the module the package ships wherever a package manager installs it", () => {
    const rules = turbopackRoutesRules(project({ root: "/app" }), NEXT_16);

    expect(Object.keys(rules)).toEqual([STUB_GLOB]);
  });

  it("matches a core linked into the app from a folder of its own by its path from the root", () => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "courier-next-linked-")));
    mkdirSync(join(root, "vendor/courier/lib/routes"), { recursive: true });
    writeFileSync(join(root, "vendor/courier/lib/routes/index.js"), "export const routes = {};\n");
    mkdirSync(join(root, "node_modules/@noverax"), { recursive: true });
    symlinkSync(join(root, "vendor/courier"), join(root, "node_modules/@noverax/courier"), "dir");
    const stubFile = realpathSync(join(root, "node_modules/@noverax/courier/lib/routes/index.js"));

    const rules = turbopackRoutesRules(project({ root, stubFile }), NEXT_16);

    expect(Object.keys(rules)).toEqual([STUB_GLOB, "vendor/courier/lib/routes/index.js"]);
  });

  it("matches the config by its path from the root, or by its name when it lies above the app", () => {
    const inside = turbopackRoutesRules(
      project({ root: "/repo/web", configFile: "/repo/web/config/courier.config.ts" }),
      NEXT_16,
    );
    const above = turbopackRoutesRules(
      project({ root: "/repo/web", configFile: "/repo/courier.config.ts" }),
      NEXT_16,
    );

    expect(Object.keys(inside)).toContain("config/courier.config.ts");
    expect(Object.keys(above)).toContain("courier.config.ts");
  });
});

/**
 * @vitest-environment node
 *
 * The Jest transformer, as Jest loads it — the CommonJS build — on the
 * module `@noverax/courier/routes` ships: the routes as each module system
 * takes them, a cache key that follows them, and a reason when they cannot
 * be read. Requires a build of this package and of the core first.
 */
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { createTransformer as CreateTransformer } from "../../src/jest/routes-transformer";
import type { TempProject } from "../vite/temp-project";
import { jsProject } from "../webpack/js-project";

const built: unknown = createRequire(import.meta.url)("../../lib/jest/transformer.cjs");
const createTransformer = Reflect.get(
  Object(built),
  "createTransformer",
) as typeof CreateTransformer;

let project: TempProject | undefined;

afterEach(() => {
  project?.remove();
  project = undefined;
});

/* What Jest hands the transformer, for a project and a module system. */
const optionsFor = (root: string, esm = false) => ({
  config: { rootDir: root },
  supportsStaticESM: esm,
});

const stub = (root: string): string =>
  join(root, "node_modules/@noverax/courier/lib/routes/index.js");

describe("the Jest transformer", () => {
  it("builds the routes as CommonJS for a test that requires them, and as an ES module for one that imports them", () => {
    project = jsProject();
    const transformer = createTransformer();

    const commonJs = transformer.process("", stub(project.root), optionsFor(project.root)).code;
    const esm = transformer.process("", stub(project.root), optionsFor(project.root, true)).code;

    expect(commonJs).toMatch(/^"use strict";\n/);
    expect(commonJs).toContain('exports.routes = {"payments":');
    expect(commonJs).toContain('"cart.add":{"type":"mutation"}');
    expect(esm).toMatch(/^export const routes = \{"payments":/);
    expect(commonJs).not.toContain("shop.example.com");
  }, 60_000);

  it("keys its cache by the routes: the same while nothing changes, another after an edit opens an endpoint", () => {
    project = jsProject();
    const transformer = createTransformer();
    const options = optionsFor(project.root);

    const first = transformer.getCacheKey("", stub(project.root), options);
    const again = transformer.getCacheKey("", stub(project.root), options);
    project.edit("src/apis.mjs", (code) =>
      code.replace('view: endpoint.get("cart")', 'view: endpoint.get("cart").expose()'),
    );
    const edited = transformer.getCacheKey("", stub(project.root), options);

    expect(again).toBe(first);
    expect(edited).not.toBe(first);
    expect(transformer.process("", stub(project.root), options).code).toContain('"cart.view"');
  }, 60_000);

  it("fails with why when the config does not load", () => {
    project = jsProject({ "src/apis.mjs": "export const shop = ;\n" });
    const root = project.root;
    const transformer = createTransformer();

    expect(() => transformer.process("", stub(root), optionsFor(root))).toThrow(
      /\[courier\] courier\.config\.mjs did not load/,
    );
  }, 60_000);
});

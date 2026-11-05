/**
 * @vitest-environment node
 *
 * The process a bundler plugin reads a project's routes in tells the
 * project's code that Courier is reading its definitions — COURIER_PHASE is
 * `definitions` there — and leaves the bundler's own process as it was.
 * Requires a build of this package first, whose worker the process runs.
 */
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { evaluateInChild } from "../../src/engine/evaluate-in-child";

const REPO_NODE_MODULES = resolve(import.meta.dirname, "../../../../node_modules");

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-definitions-phase-")));
  symlinkSync(REPO_NODE_MODULES, join(dir, "node_modules"), "dir");
  writeFileSync(join(dir, "package.json"), '{ "type": "module" }\n');
  writeFileSync(
    join(dir, "courier.config.ts"),
    `import { courier, defineApi } from "@noverax/courier/define";
const { endpoint } = courier();
/* What @t3-oss/env does unless told to skip: refuse to load without the variables. */
if (process.env.COURIER_PHASE !== "definitions" && !process.env.DATABASE_URL) throw new Error("Invalid environment variables");
export default { sources: { shop: defineApi({ baseURL: "https://shop.example.com", endpoints: { search: endpoint.get("search").expose() } }) } };
`,
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("the process the routes are read in", () => {
  it("has COURIER_PHASE set to definitions, so code that checks the environment can skip it", async () => {
    const snapshot = await evaluateInChild({ root: dir, envFiles: [] });

    expect(snapshot.routes.shop?.endpoints).toEqual({ search: { type: "query" } });
    expect(process.env.COURIER_PHASE).toBeUndefined();
  }, 30_000);
});

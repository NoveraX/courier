/**
 * `routes` typed from the config a project registers, as an install leaves
 * the package — the built declarations copied into the project's own
 * node_modules — and as a page's bundler resolves it. With the
 * `declare module` block written once, `routes.shop` is the shop's routes,
 * and a client given them reaches what the shop opens to a page; a source
 * that opens nothing has no routes. Without the block, reading a source
 * does not compile, and the type it fails on says what to add.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url));
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const TSC = join(ROOT, "node_modules/typescript/bin/tsc");

/* The strictest settings an app's tsconfig is likely to hold. */
const STRICT = [
  "--strict",
  "--exactOptionalPropertyTypes",
  "--noUncheckedIndexedAccess",
  "--module",
  "esnext",
  "--moduleResolution",
  "bundler",
  "--target",
  "esnext",
  "--lib",
  "esnext,dom",
  "--ignoreConfig",
];

/* A helper over the routes of any API declares its type in this many bytes or fewer. */
const DECLARATION_BUDGET = 2048;

let project = "";

function tsc(...args: string[]): { status: number | null; stdout: string } {
  return spawnSync(process.execPath, [TSC, ...STRICT, ...args], { cwd: project, encoding: "utf8" });
}

beforeAll(() => {
  project = mkdtempSync(join(tmpdir(), "courier-routes-register-"));
  const installed = join(project, "node_modules/@noverax/courier");
  cpSync(join(PACKAGE, "package.json"), join(installed, "package.json"));
  cpSync(join(PACKAGE, "lib"), join(installed, "lib"), { recursive: true });
  cpSync(
    join(ROOT, "node_modules/@standard-schema/spec"),
    join(project, "node_modules/@standard-schema/spec"),
    { recursive: true },
  );
  writeFileSync(join(project, "package.json"), '{ "type": "module" }\n');
  cpSync(join(PACKAGE, "tests/fixtures/routes-register"), project, { recursive: true });
  /* Copying thousands of files takes Windows far longer under a full run. */
}, 60_000);

afterAll(() => {
  rmSync(project, { recursive: true, force: true });
});

describe("routes typed from a registered config", () => {
  it("give a client the endpoints the config opens, and no source that opens none", () => {
    const result = tsc("--noEmit", "client.ts");

    expect(result.stdout).toBe("");
    expect(result.status).toBe(0);
  }, 60_000);

  it("do not compile unregistered, failing on a type that says what to add", () => {
    const result = tsc("--noEmit", "unregistered.ts");

    expect(result.stdout).toContain("Property 'shop' does not exist on type 'RoutesNeedRegister'");
    expect(result.status).not.toBe(0);
  }, 60_000);

  it("do not compile from a config typed as any record of APIs, failing on a type that says why", () => {
    const result = tsc("--noEmit", "wide.ts");

    expect(result.stdout).toContain(
      "Property 'shop' does not exist on type 'RoutesNeedTypedSources'",
    );
    expect(result.status).not.toBe(0);
  }, 60_000);

  it("keep a helper over any API's routes typed by its API, and small, where a library declares it", () => {
    const result = tsc("--declaration", "--emitDeclarationOnly", "--outDir", "out", "generic.ts");
    const declared = readFileSync(join(project, "out/generic.d.ts"), "utf8");

    expect(result.stdout).toBe("");
    expect(declared).toContain("RoutedApi<TApi");
    expect(statSync(join(project, "out/generic.d.ts")).size).toBeLessThanOrEqual(
      DECLARATION_BUDGET,
    );
  }, 60_000);
});

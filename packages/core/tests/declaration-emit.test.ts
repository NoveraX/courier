/**
 * The types an API's definition infers, under declaration emit.
 *
 * A project that emits declarations — a library, or a NestJS app, whose
 * tsconfig has `declaration: true` — writes out the type of every value it
 * exports: an API, its caller, its config. Each type those name must be
 * reachable through the package's exports; one that lives only in a chunk
 * of the build stops the project with TS2883. The consumer is set up as an
 * install leaves it — the built package copied into its own node_modules —
 * since from inside the package a chunk is one relative import away.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url));
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const TSC = join(ROOT, "node_modules/typescript/bin/tsc");

let consumer = "";

beforeAll(() => {
  consumer = mkdtempSync(join(tmpdir(), "courier-declarations-"));
  const installed = join(consumer, "node_modules/@noverax/courier");
  cpSync(join(PACKAGE, "package.json"), join(installed, "package.json"));
  cpSync(join(PACKAGE, "lib"), join(installed, "lib"), { recursive: true });
  for (const dependency of ["@standard-schema/spec", "zod"]) {
    cpSync(join(ROOT, "node_modules", dependency), join(consumer, "node_modules", dependency), {
      recursive: true,
    });
  }
  /* An ES module, as NestJS 12 and most new projects are: TypeScript names a type there only through the package's exports. */
  writeFileSync(join(consumer, "package.json"), '{ "type": "module" }\n');
  cpSync(join(PACKAGE, "tests/fixtures/declaration-consumer.ts"), join(consumer, "api.ts"));
});

afterAll(() => {
  rmSync(consumer, { recursive: true, force: true });
});

describe("an API's inferred types under declaration emit", () => {
  it("are all named through the package's exports", () => {
    const result = spawnSync(
      process.execPath,
      [
        TSC,
        "--noEmit",
        "--declaration",
        "--strict",
        "--module",
        "nodenext",
        "--moduleResolution",
        "nodenext",
        "--target",
        "esnext",
        "--lib",
        "esnext,dom",
        "--ignoreConfig",
        "api.ts",
      ],
      { cwd: consumer, encoding: "utf8" },
    );

    expect(result.stdout).toBe("");
    expect(result.status).toBe(0);
  }, 60_000);
});

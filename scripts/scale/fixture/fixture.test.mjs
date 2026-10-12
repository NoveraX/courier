/**
 * The enterprise project the scale tests measure: as many endpoints as
 * asked, the same project for the same seed, an OpenAPI document with an
 * operation for each HTTP endpoint, and files that compile — written only
 * where this script wrote before.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

import { parseSpec } from "../../../packages/studio/src/apis/parser";
import { enterpriseModel, httpEndpoints } from "./model.mjs";
import { enterpriseOpenApi } from "./openapi.mjs";
import { writeFixture } from "./write-fixture.mjs";

const REPO = resolve(import.meta.dirname, "../../..");
const cleanups = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function folder() {
  const dir = mkdtempSync(join(tmpdir(), "courier-scale-test-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

describe("the model of the company's APIs", () => {
  it("holds as many endpoints as asked, across five sources", () => {
    for (const endpoints of [100, 1000, 3000]) {
      const model = enterpriseModel({ endpoints });
      const counted = model.sources.reduce(
        (sum, source) =>
          sum +
          httpEndpoints({ sources: [source] }).length +
          source.streams.length +
          source.channels.length,
        0,
      );

      expect(model.sources.map((source) => source.name)).toEqual([
        "core",
        "billing",
        "catalog",
        "identity",
        "insights",
      ]);
      expect(counted).toBe(endpoints);
    }
  });

  it("is the same for the same seed, and another for another", () => {
    const first = JSON.stringify(enterpriseModel({ endpoints: 400, seed: 3 }));

    expect(JSON.stringify(enterpriseModel({ endpoints: 400, seed: 3 }))).toBe(first);
    expect(JSON.stringify(enterpriseModel({ endpoints: 400, seed: 4 }))).not.toBe(first);
  });

  it("names each endpoint once in its group", () => {
    for (const { group } of httpEndpoints(enterpriseModel({ endpoints: 1000 }))) {
      const names = group.endpoints.map((endpoint) => endpoint.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

describe("the OpenAPI document of the APIs", () => {
  const model = enterpriseModel({ endpoints: 1000 });
  const spec = enterpriseOpenApi(model);
  const operations = Object.values(spec.paths).flatMap((path) => Object.values(path));

  it("has an operation for each HTTP endpoint, each named once", () => {
    const ids = operations.map((operation) => operation.operationId);

    expect(operations).toHaveLength(httpEndpoints(model).length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("refers only to schemas it describes, and reads as Studio's importer reads it", () => {
    const refs = [...JSON.stringify(spec).matchAll(/"#\/components\/schemas\/(\w+)"/g)].map(
      ([, name]) => name,
    );

    const parsed = parseSpec(JSON.stringify(spec));
    const read = parsed.groups.reduce((sum, group) => sum + group.endpoints.length, 0);

    expect(refs.filter((name) => !(name in spec.components.schemas))).toEqual([]);
    expect(parsed.skipped).toEqual([]);
    expect(read).toBe(operations.length);
  });
});

describe("the project on disk", () => {
  it("is refused a folder another program wrote", () => {
    const dir = folder();
    writeFileSync(join(dir, "notes.txt"), "mine");

    expect(() => writeFixture({ dir, repo: REPO, endpoints: 60 })).toThrow(
      /was not written by this script/,
    );
    expect(readFileSync(join(dir, "notes.txt"), "utf8")).toBe("mine");
  });

  it("compiles without an error, its config and mocks beside its code", () => {
    const dir = join(folder(), "project");
    mkdirSync(dir);
    writeFileSync(join(dir, ".courier-scale-fixture"), "");

    const written = writeFixture({ dir, repo: REPO, endpoints: 60 });
    const config = ts.getParsedCommandLineOfConfigFile(
      join(dir, "tsconfig.json"),
      {},
      { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
    );
    const program = ts.createProgram(config?.fileNames ?? [], { ...config?.options, noEmit: true });
    const errors = ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));

    expect(written.endpoints).toBe(60);
    expect(existsSync(join(dir, "courier.config.ts"))).toBe(true);
    expect(existsSync(join(dir, "courier.mocks.ts"))).toBe(true);
    expect(errors).toEqual([]);
  }, 60_000);
});

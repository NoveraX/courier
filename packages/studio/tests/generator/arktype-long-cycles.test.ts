/**
 * A long reference cycle validated with ArkType, as Stripe's core objects
 * form one of 83 schemas. Each reference within the cycle took its target
 * typed as a function, so the compiler worked out what the target returns
 * around the whole cycle and stopped at its depth limit (TS2321).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";

/* Inside the repository's node_modules, so ArkType resolves as it does from a project. */
const ROOT = fileURLToPath(
  new URL("../../../../node_modules/.cache/courier-arktype-long-cycles/", import.meta.url),
);

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

function ring(size: number): string {
  const schemas: Record<string, unknown> = {};
  for (let index = 0; index < size; index++) {
    schemas[`S${index}`] = {
      type: "object",
      properties: {
        next: { $ref: `#/components/schemas/S${(index + 1) % size}` },
        v: { type: "string" },
      },
    };
  }
  const answer = {
    content: { "application/json": { schema: { $ref: "#/components/schemas/S0" } } },
  };
  return JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Ring", version: "1" },
    paths: {
      "/s": {
        get: { operationId: "getS", responses: { "200": { description: "ok", ...answer } } },
      },
    },
    components: { schemas },
  });
}

describe("an ArkType reference cycle of 83 schemas", () => {
  it("type-checks in its schemas file", () => {
    const files = generateCode(
      parseSpec(ring(83)),
      { type: "openapi", outputDir: "src", validation: "arktype" },
      "ring",
    );
    const schemas = files.find((file) => file.path.endsWith("schemas.ts"));
    const path = join(ROOT, "schemas.ts");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, schemas?.content ?? "");

    const program = ts.createProgram([path], {
      strict: true,
      noEmit: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
      skipLibCheck: true,
      types: [],
    });

    expect(ts.getPreEmitDiagnostics(program).map((diagnostic) => diagnostic.code)).toEqual([]);
  }, 120_000);
});

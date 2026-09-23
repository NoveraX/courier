/**
 * Generated schemas, compiled against the real validation libraries' types.
 *
 * A file can load and validate correctly and still fail to compile in the
 * project it is written into — a cyclic schema whose type the compiler cannot
 * infer, a `satisfies` the inferred type does not meet. This compiles what
 * the generator writes, under the strictest settings a project may use.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../src/apis/generator";
import { applyImportDefaults, generateCode } from "../src/apis/generator";
import { parseSpec } from "../src/apis/parser";
import { SHAPES_SPEC } from "./helpers/shapes-spec";

/* Inside the repository's node_modules, so the libraries resolve the way
   they do from a user's project. */
const ROOT = fileURLToPath(
  new URL("../../../node_modules/.cache/courier-generated-typecheck/", import.meta.url),
);

const BASE_OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  skipLibCheck: true,
  types: [],
};

const STRICTEST: ts.CompilerOptions = {
  ...BASE_OPTIONS,
  exactOptionalPropertyTypes: true,
  noUncheckedIndexedAccess: true,
  noImplicitOverride: true,
};

/** Write the schemas file for one option set and return its path. */
function writeSchemas(label: string, options: Partial<GenerateOptions>): string {
  const files = generateCode(
    parseSpec(JSON.stringify(SHAPES_SPEC)),
    applyImportDefaults({ type: "openapi", sourceName: "api", outputDir: "src", ...options }),
  );
  const schemas = files.find((f) => f.path.endsWith("schemas.ts"));
  const path = join(ROOT, label, "schemas.ts");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, schemas?.content ?? "");
  return path;
}

function diagnostics(path: string, options: ts.CompilerOptions): string[] {
  const program = ts.createProgram([path], options);
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => `${d.start ?? ""}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`);
}

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

describe.each(["zod", "valibot", "arktype"] as const)("%s", (validation) => {
  it.each([true, false])("compiles with generateTypes: %s", (generateTypes) => {
    const path = writeSchemas(`${validation}-${generateTypes}`, { validation, generateTypes });

    expect(diagnostics(path, BASE_OPTIONS)).toEqual([]);
  });

  it("compiles under the strictest settings", () => {
    const path = writeSchemas(`${validation}-strictest`, { validation });

    expect(diagnostics(path, STRICTEST)).toEqual([]);
  });
});

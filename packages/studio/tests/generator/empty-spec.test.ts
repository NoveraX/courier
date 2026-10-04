/**
 * A specification with no endpoint to generate — no paths, or only paths
 * the import cannot follow. Its source still compiles: it does not call
 * defineApi with no groups and no endpoints (TS2769), nor take an endpoint
 * builder it never uses (TS6133 under noUnusedLocals).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";

/* Inside the repository's node_modules, so Courier resolves as it does from a project. */
const ROOT = fileURLToPath(
  new URL("../../../../node_modules/.cache/courier-empty-spec/", import.meta.url),
);

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

const EMPTY = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Empty", version: "1" },
  paths: {},
});

describe("a specification with no endpoint to generate", () => {
  it.each(["tag", "single"] as const)(
    "compiles when grouped by %s",
    (groupBy) => {
      const files = generateCode(
        parseSpec(EMPTY),
        { type: "openapi", outputDir: "src", groupBy },
        "api",
      );
      const paths = files.map((file) => {
        const path = join(ROOT, groupBy, file.path);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, file.content);
        return path;
      });

      const program = ts.createProgram(paths, {
        strict: true,
        noEmit: true,
        noUnusedLocals: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        target: ts.ScriptTarget.ES2022,
        skipLibCheck: true,
        types: [],
      });

      expect(ts.getPreEmitDiagnostics(program).map((diagnostic) => diagnostic.code)).toEqual([]);
    },
    60_000,
  );
});

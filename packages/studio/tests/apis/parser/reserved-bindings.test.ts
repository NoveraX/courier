/**
 * A name a module cannot bind, or one the generated code reads itself, is
 * never bound as it is: a tag named `eval`, `arguments` or `undefined`, or
 * one that reads `globalThis`, names its group with a suffix, and so does an
 * import of such a name its source and its folder, so each module loads as
 * the strict code a module is; a query parameter of such a name is taken
 * under a local name, so a call that sends no body sends none in its place
 * and a secret is read from the environment.
 */
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { generateCode } from "../../../src/apis/generator";
import { parseSpec } from "../../../src/apis/parser";
import { isReservedBinding } from "../../../src/apis/parser/reserved-bindings";

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Evals", version: "1" },
    paths: {
      "/evals": {
        get: {
          operationId: "listEvals",
          tags: ["eval"],
          responses: { 200: { description: "ok" } },
        },
      },
      "/arguments": {
        get: {
          operationId: "listArguments",
          tags: ["arguments"],
          responses: { 200: { description: "ok" } },
        },
      },
      "/things": {
        post: {
          operationId: "makeThing",
          tags: ["undefined"],
          parameters: [{ name: "undefined", in: "query", schema: { type: "string" } }],
          responses: { 200: { description: "ok" } },
        },
      },
      "/secrets": {
        post: {
          operationId: "keepSecret",
          tags: ["Global This"],
          parameters: [{ name: "globalThis", in: "query", schema: { type: "string" } }],
          responses: { 200: { description: "ok" } },
        },
      },
    },
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
    security: [{ bearer: [] }],
  }),
);

/* What TypeScript says of a module's own code — its grammar, and a name bound twice — read alone. */
function ownProblems(path: string, content: string): string[] {
  const file = ts.createSourceFile(path, content, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const host = ts.createCompilerHost({});
  const program = ts.createProgram({
    rootNames: [path],
    options: { noEmit: true, strict: true, noResolve: true, types: [] },
    host: {
      ...host,
      getSourceFile: (name, target) => (name === path ? file : host.getSourceFile(name, target)),
      fileExists: (name) => name === path || host.fileExists(name),
      readFile: (name) => (name === path ? content : host.readFile(name)),
    },
  });
  return [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)]
    .filter((problem) => problem.code < 2000 || problem.code === 2300 || problem.code === 2451)
    .map((problem) => ts.flattenDiagnosticMessageText(problem.messageText, " "));
}

describe("a name a module cannot bind, or one the generated code reads", () => {
  it("is a reserved binding", () => {
    for (const name of ["eval", "arguments", "undefined", "globalThis", "Error"]) {
      expect(isReservedBinding(name)).toBe(true);
    }
  });

  it("names a tag's group with a suffix, so every module generated loads as strict code", () => {
    expect(SPEC.groups.map((group) => group.name).sort()).toEqual([
      "argumentsGroup",
      "evalGroup",
      "globalThisGroup",
      "undefinedGroup",
    ]);
    for (const file of generateCode(SPEC, { type: "openapi", outputDir: "src/api" }, "evals")) {
      expect(ownProblems(file.path, file.content)).toEqual([]);
    }
  });

  it("reads a secret from the environment, not from a group named after the global", () => {
    const files = generateCode(
      SPEC,
      { type: "openapi", outputDir: "src/api", addAuthMiddleware: true },
      "evals",
    );
    const source = files.find((file) => file.path.endsWith("/source.ts"))?.content ?? "";

    expect(source).toContain("const runtime = globalThis as");
    expect(source).toContain("import { globalThisGroup }");
    expect(source).not.toMatch(/import \{ globalThis \}/);
  });

  it.each(["eval", "undefined"])(
    "names an import called %s with a suffix, in a folder of that name",
    (name) => {
      const files = generateCode(SPEC, { type: "openapi", outputDir: "src/api" }, name);
      const source = files.find((file) => file.path.endsWith("/source.ts"));

      expect(files.every((file) => file.path.startsWith(`src/api/${name}-group/`))).toBe(true);
      expect(source?.content).toContain(`export const ${name}Group = defineApi(`);
      for (const file of files) expect(ownProblems(file.path, file.content)).toEqual([]);
    },
  );

  it("takes a query parameter of such a name under a local name, so no body is sent in its place", () => {
    const files = generateCode(
      SPEC,
      { type: "openapi", outputDir: "src/api", validation: "none" },
      "evals",
    );
    const group = files.find((file) => file.path.endsWith("/undefined-group/index.ts"));

    expect(group?.content).toContain(
      '(http, { undefined: param0 }) => http.post("things", void 0, { searchParams: { undefined: param0 } })',
    );
    expect(
      files.find((file) => file.path.endsWith("/global-this-group/index.ts"))?.content,
    ).toContain("(http, { globalThis: param0 })");
  });
});

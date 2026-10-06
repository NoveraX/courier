import { describe, expect, it } from "vitest";
import { generateCode } from "../src/apis/generator";
import { parseSpec } from "../src/apis/parser";

/**
 * A spec whose operations carry no tag is the most ordinary spec there is.
 * Grouped by tag, its endpoints are in no group: they sit in the API itself,
 * where a group named `default` — which may name an object key but may not
 * name a binding — once put them. The generated module has to parse.
 */
const TAGLESS_SPEC = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Todo API", version: "1.0.0" },
  paths: {
    "/todos": {
      get: {
        operationId: "listTodos",
        responses: { "200": { description: "ok" } },
      },
    },
  },
});

function taggedSpec(tag: string): string {
  return JSON.stringify({
    openapi: "3.0.0",
    info: { title: "API", version: "1.0.0" },
    paths: {
      "/things": {
        get: { operationId: "list", tags: [tag], responses: { "200": { description: "ok" } } },
      },
    },
  });
}

function parses(source: string): boolean {
  try {
    /* Strips the type-only syntax the runtime parser would reject, leaving the
       declarations and imports this test is about. */
    new Function(source.replace(/^import .*$/gm, "").replace(/^export /gm, ""));
    return true;
  } catch {
    return false;
  }
}

function filesFor(spec: string): { path: string; content: string }[] {
  return generateCode(parseSpec(spec), {
    sourceName: "todoApi",
    outputDir: "src/api/todoApi",
  } as never).map((f) => ({ path: f.path, content: f.content }));
}

describe("generated code", () => {
  it("puts the untagged endpoints in the API itself, in no group", () => {
    const files = filesFor(TAGLESS_SPEC);
    const source = files.find((f) => f.path.endsWith("source.ts"));

    expect(source?.content).toMatch(/endpoints: \{\n {4}listTodos: endpoint\.get\("todos"\)/);
    expect(source?.content).not.toMatch(/\bgroups:/);
    expect(files.map((f) => f.path)).toEqual([
      "src/api/todoApi/todo-api/source.ts",
      "src/api/todoApi/todo-api/index.ts",
    ]);
  });

  it("emits an untagged group that parses", () => {
    for (const file of filesFor(TAGLESS_SPEC)) {
      expect(parses(file.content), `${file.path} did not parse`).toBe(true);
    }
  });

  it.each(["class", "new", "function", "import", "return", "2fa"])(
    "emits a group tagged %s that parses",
    (tag) => {
      for (const file of filesFor(taggedSpec(tag))) {
        expect(parses(file.content), `${file.path} did not parse`).toBe(true);
      }
    },
  );

  it("leaves an ordinary tag alone", () => {
    const source = filesFor(taggedSpec("todos")).find((f) => f.path.endsWith("source.ts"));

    expect(source?.content).toMatch(/import \{ todos \}/);
  });
});

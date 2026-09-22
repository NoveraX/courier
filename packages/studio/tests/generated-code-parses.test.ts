import { describe, expect, it } from "vitest";

import { parseSpec } from "../src/apis/parser";
import { generateCode } from "../src/apis/generator";

/**
 * A spec whose operations carry no tag is the most ordinary spec there is,
 * and its endpoints are grouped under the name `default` — which may name an
 * object key but may not name a binding. The generated module has to parse.
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
  it("names the untagged group with something that can be a binding", () => {
    const files = filesFor(TAGLESS_SPEC);
    const source = files.find((f) => f.path.endsWith("source.ts"));

    expect(source?.content).not.toMatch(/import \{ default \}/);
    expect(source?.content).not.toMatch(/\bconst default\b/);
    expect(source?.content).toMatch(/import \{ defaultGroup \}/);
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

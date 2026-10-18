import { describe, expect, it } from "vitest";
import { generateCode } from "../src/apis/generator";
import { jsdocText } from "../src/apis/generator/jsdoc-text";
import { parseSpec } from "../src/apis/parser";
import { specText } from "../src/apis/parser/string-utils";

const COMMENT_CLOSE = `*${"/"}`;

function generate(spec: object): { path: string; content: string }[] {
  return generateCode(parseSpec(JSON.stringify(spec)), {
    type: "openapi",
    sourceName: "api",
    outputDir: "src/api",
  });
}

function parses(source: string): boolean {
  try {
    new Function(source.replace(/^import .*$/gm, "").replace(/^export /gm, ""));
    return true;
  } catch {
    return false;
  }
}

describe("jsdocText", () => {
  it("keeps a comment from closing early", () => {
    expect(jsdocText(`match release/**${"/"}*`)).not.toContain(COMMENT_CLOSE);
  });

  it("leaves ordinary prose untouched", () => {
    expect(jsdocText("A list of todos.")).toBe("A list of todos.");
    expect(jsdocText("<p>List <code>items</code></p>")).toBe("<p>List <code>items</code></p>");
  });

  /* A page's HTML parser knows no comment of the code's: a `</script` in one
     ends a `<script>` the code is put in, and a `<!--` upsets it. */
  it("breaks what would end or upset a page's script", () => {
    expect(jsdocText("a </script> b <!-- c --> </SCRIPT>")).toBe(
      "a <\\/script> b <\\!-- c --> <\\/SCRIPT>",
    );
  });
});

describe("specText", () => {
  it("passes prose through", () => {
    expect(specText("Introduction")).toBe("Introduction");
  });

  it("rejects a value that only looks like prose", () => {
    /* DigitalOcean writes tag descriptions as an external reference, so the
       value arrives as an object and every string operation on it throws. */
    expect(specText({ $ref: "description.yml#/introduction" })).toBeUndefined();
    expect(specText(42)).toBeUndefined();
    expect(specText(null)).toBeUndefined();
    expect(specText("   ")).toBeUndefined();
  });
});

describe("a description carrying a comment delimiter", () => {
  it("does not break the generated module", () => {
    const files = generate({
      openapi: "3.0.0",
      info: { title: "Globs", version: "1.0.0" },
      paths: {
        "/branches": {
          get: {
            operationId: "listBranches",
            summary: `Wildcards will not match a slash, so use release/**${"/"}*`,
            responses: { "200": { description: "ok" } },
          },
        },
      },
    });

    for (const file of files) {
      expect(parses(file.content), `${file.path} did not parse`).toBe(true);
    }
  });
});

describe("a tag description that is not a string", () => {
  it("is skipped instead of crashing the parse", () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Refs", version: "1.0.0" },
      tags: [{ name: "Intro", description: { $ref: "description.yml#/introduction" } }],
      paths: {
        "/things": {
          get: {
            operationId: "list",
            tags: ["Intro"],
            responses: { "200": { description: "ok" } },
          },
        },
      },
    };

    expect(() => parseSpec(JSON.stringify(spec))).not.toThrow();
    expect(parseSpec(JSON.stringify(spec)).groups[0]?.description).toBe("");
  });
});

/**
 * How a closure takes parameters out of the variables: a name that can be
 * bound as it is, as it is; any other — `page-size`, `body`, `__proto__` —
 * under a local name of its own, and so a name a binding would shadow a
 * global by — `Date`, `constructor` —, which linters refuse; and a pattern
 * that takes a name every object inherits says so, so that the closure
 * reads it from the variables' own fields only.
 */
import { afterAll, describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { destructure } from "../../src/apis/generator/variable-bindings";
import { parseSpec } from "../../src/apis/parser";
import type { ParsedParameter } from "../../src/apis/parser/types";
import {
  compileProject,
  loadGenerated,
  removeProjects,
  STRICT,
  writeProject,
} from "../helpers/generated-project";

const query = (name: string): ParsedParameter => ({
  name,
  in: "query",
  required: false,
  type: "string",
  description: "",
});

describe("destructure", () => {
  it("binds ordinary names as they are, and reads them as it always did", () => {
    expect(destructure([query("dryRun"), query("page-size")], [])).toEqual({
      pattern: 'dryRun, "page-size": param1',
      searchParams: '{ dryRun, "page-size": param1 }',
      ownCopy: false,
    });
  });

  it("binds __proto__ under a local name, through a computed key", () => {
    expect(destructure([query("__proto__")], [])).toEqual({
      pattern: '["__proto__"]: param0',
      searchParams: '{ ["__proto__"]: param0 }',
      ownCopy: true,
    });
  });

  it("binds a name a binding would shadow a global by under a local name", () => {
    expect(destructure([query("Date"), query("String"), query("constructor")], [])).toEqual({
      pattern: "Date: param0, String: param1, constructor: param2",
      searchParams: "{ Date: param0, String: param1, constructor: param2 }",
      ownCopy: true,
    });
    expect(destructure([], [{ ...query("toString"), in: "path" }]).pattern).toBe(
      "toString: param0",
    );
  });

  it("gives a local name no parameter of the pattern is bound under", () => {
    expect(destructure([query("Date"), query("param0"), query("page-size")], [])).toEqual({
      pattern: 'Date: param0_2, param0, "page-size": param2',
      searchParams: '{ Date: param0_2, param0, "page-size": param2 }',
      ownCopy: false,
    });
  });

  it("reads a name every object inherits from the variables' own fields", () => {
    for (const name of ["constructor", "toString", "valueOf", "hasOwnProperty"]) {
      expect(destructure([query(name)], []).ownCopy).toBe(true);
    }
    expect(destructure([], [{ ...query("constructor"), in: "path" }]).ownCopy).toBe(true);
  });
});

afterAll(() => removeProjects("variable-bindings"));

describe("a closure taking a parameter under a local name another parameter has", () => {
  it("compiles and loads", () => {
    const spec = parseSpec(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Shop", version: "1" },
        servers: [{ url: "https://shop.test" }],
        paths: {
          "/notes": {
            put: {
              operationId: "putNote",
              parameters: [
                { name: "Date", in: "query", schema: { type: "string" } },
                { name: "param0", in: "query", schema: { type: "string" } },
              ],
              requestBody: {
                content: {
                  "application/json": {
                    schema: { type: "object", properties: { text: { type: "string" } } },
                  },
                },
              },
              responses: { "204": { description: "saved" } },
            },
          },
        },
      }),
    );
    const files = generateCode(
      spec,
      { type: "openapi", outputDir: "src/api", validation: "none" },
      "shop",
    );

    expect(() => loadGenerated(files, "src/api/shop/index.ts")).not.toThrow();
    expect(
      compileProject(
        writeProject("variable-bindings/collision", files),
        ["src/api/shop/index.ts"],
        STRICT,
      ),
    ).toEqual([]);
  }, 60_000);
});

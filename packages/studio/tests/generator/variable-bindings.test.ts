/**
 * How a closure takes parameters out of the variables: a name that can be
 * bound as it is, as it is; any other — `page-size`, `body`, `__proto__` —
 * under a local name of its own; and a pattern that takes a name every
 * object inherits says so, so that the closure reads it from the
 * variables' own fields only.
 */
import { describe, expect, it } from "vitest";

import { destructure } from "../../src/apis/generator/variable-bindings";
import type { ParsedParameter } from "../../src/apis/parser/types";

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

  it("reads a name every object inherits from the variables' own fields", () => {
    for (const name of ["constructor", "toString", "valueOf", "hasOwnProperty"]) {
      expect(destructure([query(name)], []).ownCopy).toBe(true);
    }
    expect(destructure([], [{ ...query("constructor"), in: "path" }]).ownCopy).toBe(true);
  });
});

/**
 * A closure that takes the variables apart does so in its parameter list,
 * unless a name it takes is one every object inherits: it then reads them
 * from a copy of the variables' own fields with no prototype, so a field
 * the caller left out is `undefined`, not the member every object has.
 */
import { describe, expect, it } from "vitest";

import { destructuringClosure } from "../../src/apis/generator/destructuring-closure";

/* The closure compiled, called with variables, giving back what it took. */
function run(source: string, vars: unknown): unknown {
  const closure = new Function(`return ${source};`)();
  return closure({ put: (...args: unknown[]) => args }, vars);
}

describe("destructuringClosure", () => {
  it("takes the variables apart in its parameter list when no name is inherited", () => {
    expect(destructuringClosure("dryRun, ...body", 'http.put("items", body)', false)).toBe(
      '(http, { dryRun, ...body }) => http.put("items", body)',
    );
  });

  it("reads an inherited name the caller left out as undefined, and one given as given", () => {
    const source = destructuringClosure(
      'constructor, ["__proto__"]: param1, ...body',
      'http.put("items", body, { searchParams: { constructor, ["__proto__"]: param1 } })',
      true,
    );

    const [, left, absent] = run(source, { name: "a" }) as [
      string,
      object,
      { searchParams: object },
    ];
    expect(left).toEqual({ name: "a" });
    expect(Object.entries(absent.searchParams)).toEqual([
      ["constructor", undefined],
      ["__proto__", undefined],
    ]);
    const given = JSON.parse('{ "name": "a", "constructor": "c", "__proto__": "p" }');
    const [, body, options] = run(source, given) as [string, object, { searchParams: object }];
    expect(body).toEqual({ name: "a" });
    expect(Object.entries(options.searchParams)).toEqual([
      ["constructor", "c"],
      ["__proto__", "p"],
    ]);
  });

  it("reads Object through globalThis, so a parameter named Object can be taken", () => {
    const source = destructuringClosure(
      "Object, constructor",
      'http.put("items", { Object, constructor })',
      true,
    );

    expect(run(source, { Object: "o" })).toEqual([
      "items",
      { Object: "o", constructor: undefined },
    ]);
  });
});

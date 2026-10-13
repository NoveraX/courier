/**
 * An answer that succeeded has what it says went wrong rewritten wherever
 * that is, and nothing else touched: what does not change is the answer's
 * own, not a copy, and the answer itself is never changed in place.
 */
import { describe, expect, it } from "vitest";

import { errorFieldsRewritten } from "../src/server/error-fields-rewritten";

const hide = (text: string): string => text.replaceAll("/m/", "~/");

describe("errorFieldsRewritten", () => {
  it("rewrites the fields that say what went wrong, in objects and lists at any depth", () => {
    const answer = {
      name: "keep",
      path: "/m/keep",
      results: [
        [{ error: "/m/a", path: "/m/keep" }],
        { deep: { reason: "/m/b", problems: ["/m/c"] } },
      ],
    };

    expect(errorFieldsRewritten(answer, hide)).toEqual({
      name: "keep",
      path: "/m/keep",
      results: [
        [{ error: "~/a", path: "/m/keep" }],
        { deep: { reason: "~/b", problems: ["~/c"] } },
      ],
    });
  });

  it("leaves the answer as it was, and shares every part nothing in changed", () => {
    const untouched = { rows: [{ id: 1 }] };
    const answer = { untouched, changed: { error: "/m/a" } };

    const shown = errorFieldsRewritten(answer, hide) as typeof answer;

    expect(shown.changed.error).toBe("~/a");
    expect(answer.changed.error).toBe("/m/a");
    expect(shown.untouched).toBe(untouched);
    expect(errorFieldsRewritten(untouched, hide)).toBe(untouched);
  });

  it("rewrites an Error anywhere as JSON sends it, and a class instance by what JSON makes of it", () => {
    class Outcome {
      constructor(readonly warning: string) {}
    }
    const answer = {
      result: Object.assign(new Error("hidden"), { path: "/m/p" }),
      outcome: new Outcome("/m/w"),
    };

    expect(errorFieldsRewritten(answer, hide)).toEqual({
      result: { path: "~/p" },
      outcome: { warning: "~/w" },
    });
  });

  it("keeps a field named __proto__ a field, and the copy's prototype Object's", () => {
    const answer = JSON.parse('{"__proto__": {"error": "/m/a"}, "error": "/m/b"}') as object;

    const shown = errorFieldsRewritten(answer, hide) as Record<string, unknown>;

    expect(Object.getPrototypeOf(shown)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(shown, "__proto__")?.value).toEqual({ error: "~/a" });
    expect(shown.error).toBe("~/b");
  });
});

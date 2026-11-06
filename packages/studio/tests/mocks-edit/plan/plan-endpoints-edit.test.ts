/**
 * Adding endpoints to the list a mock answers, as `courier.mocks.ts`
 * declares it: each name appended to its `endpoints` array as the array's
 * layout has them, quoted as the file quotes, only ever by insertion — and
 * a mock Studio cannot read in full left to the developer, with why.
 */
import { describe, expect, it } from "vitest";

import { MocksEditRefusal } from "../../../src/server/mocks-edit/mocks-edit-refusal";
import { planEndpointsEdit } from "../../../src/server/mocks-edit/plan/plan-endpoints-edit";

const HEAD = [
  'import { defineMocks, defineMockServer } from "@noverax/courier-mock";',
  'import courierConfig from "./courier.config";',
  "",
].join("\n");

function mocksFile(entry: string): string {
  return `${HEAD}export default defineMocks({\n  shop: ${entry},\n});\n`;
}

function plan(text: string, add: string[], key = "shop") {
  return planEndpointsEdit({ existing: { name: "courier.mocks.ts", text }, key, add });
}

function refusal(text: string, key = "shop"): string {
  try {
    plan(text, ["orders.refund"], key);
  } catch (err) {
    if (err instanceof MocksEditRefusal) return err.code;
    throw err;
  }
  throw new Error("the edit was planned");
}

describe("adding endpoints to a mock's list", () => {
  it("appends them to a list on one line", () => {
    const text = mocksFile(
      'defineMockServer({ source: courierConfig.sources.shop, endpoints: ["orders.list"] })',
    );

    const planned = plan(text, ["orders.refund", "orders.get"]);

    expect(planned.text).toBe(
      mocksFile(
        'defineMockServer({ source: courierConfig.sources.shop, endpoints: ["orders.list", "orders.refund", "orders.get"] })',
      ),
    );
    expect(planned.after).toEqual(["orders.list", "orders.refund", "orders.get"]);
  });

  it("appends them a line each to a list written a line each, keeping its trailing comma", () => {
    const text = mocksFile(
      [
        "defineMockServer({",
        "    source: courierConfig.sources.shop,",
        "    endpoints: [",
        "      'orders.list',",
        "    ],",
        "  })",
      ].join("\n"),
    );

    expect(plan(text, ["orders.refund"]).text).toBe(
      mocksFile(
        [
          "defineMockServer({",
          "    source: courierConfig.sources.shop,",
          "    endpoints: [",
          "      'orders.list',",
          "      'orders.refund',",
          "    ],",
          "  })",
        ].join("\n"),
      ),
    );
  });

  it("writes into an empty list, and leaves out what the list holds already", () => {
    const text = mocksFile(
      "defineMockServer({ source: courierConfig.sources.shop, endpoints: [] })",
    );

    const planned = plan(text, ["orders.list", "orders.list"]);

    expect(planned.after).toEqual(["orders.list"]);
    expect(plan(planned.text, ["orders.list"]).edits).toEqual([]);
  });

  it("only inserts, and keeps every comment where it was", () => {
    const text = mocksFile(
      [
        "defineMockServer({",
        "    source: courierConfig.sources.shop,",
        "    // what the demo needs",
        '    endpoints: ["orders.list" /* the first */],',
        "  })",
      ].join("\n"),
    );

    const planned = plan(text, ["orders.refund"]);

    expect(planned.edits.every((edit) => edit.start === edit.end)).toBe(true);
    expect(planned.text).toContain("// what the demo needs");
    expect(planned.text).toContain("/* the first */");
    expect(planned.after).toEqual(["orders.list", "orders.refund"]);
  });
});

describe("a mock Studio leaves to the developer", () => {
  it.each([
    [
      "one it does not declare",
      'defineMockServer({ source: courierConfig.sources.shop, endpoints: ["a"] })',
      "MOCK_NOT_FOUND",
      "other",
    ],
    [
      "one that answers every endpoint already",
      "defineMockServer({ source: courierConfig.sources.shop })",
      "MOCK_ANSWERS_ALL",
      "shop",
    ],
    [
      "one whose list is a variable",
      "defineMockServer({ source: courierConfig.sources.shop, endpoints: picked })",
      "ENDPOINTS_NOT_LITERAL",
      "shop",
    ],
    [
      "one whose list spreads another",
      'defineMockServer({ source: courierConfig.sources.shop, endpoints: [...picked, "a"] })',
      "ENDPOINTS_NOT_LITERAL",
      "shop",
    ],
    [
      "one whose list holds a template",
      "defineMockServer({ source: courierConfig.sources.shop, endpoints: [`orders.$" +
        "{name}`] })",
      "ENDPOINTS_NOT_LITERAL",
      "shop",
    ],
    [
      "one built by something else than defineMockServer",
      'makeMock({ source: courierConfig.sources.shop, endpoints: ["a"] })',
      "MOCK_NOT_LITERAL",
      "shop",
    ],
    [
      "one whose options are not an object literal",
      "defineMockServer(options)",
      "MOCK_NOT_LITERAL",
      "shop",
    ],
  ])("%s", (_, entry, code, key) => {
    expect(refusal(mocksFile(entry), key)).toBe(code);
  });
});

/* mulberry32: the same draws on every run, and a failing draw's seed reproduces it. */
function seeded(seed: number): (below: number) => number {
  let state = seed >>> 0;
  return (below) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) % below;
  };
}

describe("adding endpoints, for 300 layouts drawn at random", () => {
  it("inserts only, and leaves the list it means", () => {
    const next = seeded(0x5b25);
    const spaces = ["", " ", "  "];
    for (let draw = 0; draw < 300; draw++) {
      const held = Array.from({ length: next(4) }, (_, at) => `orders.held${at}`);
      const quote = next(2) === 0 ? '"' : "'";
      const block = next(2) === 0;
      const trailing = held.length > 0 && next(2) === 0;
      const pad = spaces[next(3)] ?? "";
      const items = held.map((name) => `${quote}${name}${quote}`);
      const array = block
        ? `[\n${items
            .map((item) => `      ${item},`)
            .join("\n")
            .replace(/,$/, trailing ? "," : "")}\n    ]`
        : `[${pad}${items.join(", ")}${trailing ? "," : ""}${pad}]`;
      const text = mocksFile(
        `defineMockServer({ source: courierConfig.sources.shop, endpoints: ${array} })`,
      );
      const add = Array.from({ length: 1 + next(3) }, (_, at) => `orders.new${at}`);

      const planned = plan(text, add);

      expect(planned.after, `draw ${draw}`).toEqual([...held, ...add]);
      expect(
        planned.edits.every((edit) => edit.start === edit.end),
        `draw ${draw}`,
      ).toBe(true);
      expect(plan(planned.text, add).edits, `draw ${draw}`).toEqual([]);
    }
  });
});

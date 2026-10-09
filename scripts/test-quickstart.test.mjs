import { describe, expect, it } from "vitest";

import { quickstartIds } from "./test-quickstart.mjs";

const TARGETS = [{ id: "next" }, { id: "nuxt" }, { id: "hono" }];

describe("quickstartIds", () => {
  it("runs every framework when none is named", () => {
    expect(quickstartIds(TARGETS, [])).toEqual(["next", "nuxt", "hono"]);
  });

  it("runs the ones named, in the list's order", () => {
    expect(quickstartIds(TARGETS, ["hono", "next"])).toEqual(["next", "hono"]);
  });

  it("refuses a name the list does not have, naming the ones it has", () => {
    expect(() => quickstartIds(TARGETS, ["angular"])).toThrow(
      "Not in e2e/quickstart/targets.json: angular. It lists: next, nuxt, hono",
    );
  });

  it("refuses a list whose entries have no id", () => {
    expect(() => quickstartIds([{ id: "next" }, {}], [])).toThrow("every entry needs an id");
    expect(() => quickstartIds({}, [])).toThrow("is not a list");
  });
});

/**
 * The import wizard's and manage's selections are records keyed by group
 * name: a group named like an `Object.prototype` member is looked up as
 * its own key, never reaching the prototype.
 */
import { describe, expect, it } from "vitest";

import { toggleEndpointReducer } from "../src/apis/import-actions";
import { INITIAL_IMPORT_STATE } from "../src/features/apis/initial-import-state";
import { toggleInSet } from "../src/features/apis/manage-toggle";

describe("a group named like an Object.prototype member", () => {
  it("is toggled in manage like any other", () => {
    const next = toggleInSet({}, "toString", "listA");

    expect(Object.entries(next)).toEqual([["toString", new Set(["listA"])]]);
  });

  it("is picked from in the wizard like any other", () => {
    const state = { ...INITIAL_IMPORT_STATE, selectedEndpoints: {} };

    const next = toggleEndpointReducer(state, "constructor", "listB");

    expect(Object.entries(next.selectedEndpoints)).toEqual([["constructor", ["listB"]]]);
  });
});

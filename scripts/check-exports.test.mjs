/**
 * Self-test for the error filter of `scripts/check-exports.mjs`. The check
 * reads the published declarations for real instead of skipping them, so tsc
 * also reports errors in other packages' declarations; only ours may fail it.
 */
import { describe, expect, it } from "vitest";

import { ourErrors } from "./check-exports.mjs";

describe("ourErrors", () => {
  it("keeps an error in a package's published declarations, or in the probe", () => {
    const output = [
      "packages/core/lib/index.d.ts(968,17): error TS2304: Cannot find name 'RequestCredentials'.",
      "node_modules/.cache/courier-check-exports/probe.mts(1,20): error TS2307: Cannot find module '@noverax/courier/gone'.",
    ].join("\n");

    expect(ourErrors(output)).toHaveLength(2);
  });

  it("leaves out errors in other packages' declarations, and anything that is no error", () => {
    const output = [
      "node_modules/@types/react-dom/index.d.ts(3,1): error TS2304: Cannot find name 'HTMLElement'.",
      "node_modules/next/dist/server/web/spec-extension/request.d.ts(9,5): error TS2304: Cannot find name 'RequestInit'.",
      "Found 2 errors in 2 files.",
    ].join("\n");

    expect(ourErrors(output)).toEqual([]);
  });
});

/**
 * Self-test for the error filter of `scripts/check-exports.mjs`. The check
 * reads the published declarations for real instead of skipping them, so tsc
 * also reports errors in other packages' declarations; only ours may fail it.
 */
import { describe, expect, it } from "vitest";

import { node10Errors, ourErrors } from "./check-exports.mjs";

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

describe("node10Errors", () => {
  it("keeps an entry point or a module of ours that node10 cannot find", () => {
    const errors = [
      "node_modules/.cache/courier-check-exports/probe.ts(3,20): error TS2307: Cannot find module '@noverax/courier/define'.",
      "packages/next/lib/middleware.d.ts(2,31): error TS2307: Cannot find module '@noverax/courier/define' or its corresponding type declarations.",
    ];

    expect(node10Errors(errors)).toEqual(errors);
  });

  it("leaves out a dependency that ships no types node10 can read", () => {
    const errors = [
      "packages/studio/lib/vite.d.ts(2,24): error TS2307: Cannot find module 'vite' or its corresponding type declarations.",
      "packages/studio-core/lib/runtime/load-config.d.ts(2,10): error TS2305: Module '\"jiti\"' has no exported member 'Jiti'.",
    ];

    expect(node10Errors(errors)).toEqual([]);
  });
});

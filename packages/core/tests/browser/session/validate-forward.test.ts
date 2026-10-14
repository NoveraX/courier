/**
 * The check of `forward` as a page's bundle has it: none, as a page passes
 * no request's headers on — where the server's module refuses a `forward`
 * that could not work as written.
 */
import { describe, expect, it } from "vitest";

import * as Browser from "../../../src/browser/session/validate-forward";
import * as Server from "../../../src/session/validate-forward";

const MISTYPED = { requestld: true };

describe("assertForwardOptions in a page", () => {
  it("refuses nothing the server refuses", () => {
    expect(() => Server.assertForwardOptions(MISTYPED, "api")).toThrow(/forward/);
    expect(() => Browser.assertForwardOptions(MISTYPED, "api")).not.toThrow();
  });

  it("stands where the server's check does", () => {
    const standIn: typeof Server = Browser;

    expect(standIn.assertForwardOptions).toBeTypeOf("function");
  });
});

/**
 * The server's logger as a page's bundle has it: the devtools console's,
 * typed as the terminal logger is.
 */
import { describe, expect, it } from "vitest";

import * as Browser from "../../../src/browser/logger/server";
import { browserLogger } from "../../../src/logger/browser";
import type * as Server from "../../../src/logger/server";

describe("serverLogger in a page", () => {
  it("is the devtools console's logger", () => {
    expect(Browser.serverLogger).toBe(browserLogger);
  });

  it("stands where the terminal logger does", () => {
    const standIn: typeof Server = Browser;

    expect(standIn.serverLogger.warn).toBeTypeOf("function");
  });
});

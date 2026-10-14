/**
 * The chain of addresses a request came through, as a page's bundle has
 * it: none, as a page serves no request — where a server's module weighs
 * the proxies in front of it.
 */
import { describe, expect, it } from "vitest";

import * as Browser from "../../../src/browser/utils/forwarded-for";
import * as Server from "../../../src/utils/forwarded-for";

describe("forwarded-for in a page", () => {
  it("passes no chain on for a request", () => {
    const request = new Request("https://app.example.com/orders", {
      headers: { "x-forwarded-for": "198.51.100.4" },
    });

    expect(Browser.forwardedFor(request)).toBeUndefined();
  });

  it("reads no chain where the server's module reads one", () => {
    expect(Server.forwardedChain("10.0.0.2", "198.51.100.4")).toBe("198.51.100.4, 10.0.0.2");
    expect(Browser.forwardedChain("10.0.0.2", "198.51.100.4")).toBeUndefined();
  });

  it("stands where the server's module does", () => {
    const standIn: typeof Server = Browser;

    expect(standIn.forwardedFor).toBeTypeOf("function");
  });
});

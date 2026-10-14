/**
 * A session refuses a header list that would carry cookies wholesale
 * beside it, in a page as on a server.
 */
import { describe, expect, it } from "vitest";

import { ConfigurationError } from "../../src/errors/configuration-error";
import { assertNoCookieHeaders } from "../../src/session/assert-no-cookie-headers";

describe("assertNoCookieHeaders", () => {
  it("passes a list without cookies", () => {
    expect(() => assertNoCookieHeaders(["x-total-count"], "api")).not.toThrow();
    expect(() => assertNoCookieHeaders(undefined, "api")).not.toThrow();
  });

  it.each(["cookie", "Set-Cookie"])("refuses %s, naming the list it is in", (name) => {
    let failure: unknown;
    try {
      assertNoCookieHeaders(["x-total-count", name], "shop.orders");
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ConfigurationError);
    expect(failure).toMatchObject({ code: "SESSION_HEADER_CONFLICT" });
    expect(String(failure)).toContain(`shop.orders: "${name}"`);
  });
});

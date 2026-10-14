/**
 * The cookies an answer sets, read where the runtime tells them apart and
 * passed over where it does not — Safari before 17, Chrome before 113,
 * Firefox before 112 and React Native have no `Headers.getSetCookie` — so a
 * page asking for its double-submit token there neither throws nor says the
 * asking failed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { askForToken } from "../../src/utils/csrf-prime";
import { setCookiesOf } from "../../src/utils/set-cookies";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Headers as a runtime without `getSetCookie` has them. */
function olderHeaders(init: HeadersInit): Headers {
  const headers = new Headers(init);
  Object.defineProperty(headers, "getSetCookie", { value: undefined });
  return headers;
}

describe("setCookiesOf", () => {
  it("reads each cookie an answer sets on its own", () => {
    const headers = new Headers([
      ["set-cookie", "sid=a1; Path=/; HttpOnly"],
      ["set-cookie", "theme=dark"],
    ]);

    expect(setCookiesOf(headers)).toEqual(["sid=a1; Path=/; HttpOnly", "theme=dark"]);
  });

  it("reads none where the runtime cannot tell them apart, or there are no headers", () => {
    expect(setCookiesOf(olderHeaders([["set-cookie", "sid=a1"]]))).toEqual([]);
    expect(setCookiesOf(undefined)).toEqual([]);
  });
});

describe("asking for the double-submit token on a runtime without getSetCookie", () => {
  it("answers no cookies, and says nothing failed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const answer = new Response(null, { status: 204 });
    Object.defineProperty(answer, "headers", {
      value: olderHeaders([["set-cookie", "csrftoken=t1"]]),
    });

    const cookies = await askForToken(Promise.resolve(answer), "/csrf");

    expect(cookies).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});

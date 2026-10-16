/**
 * Which answers a Playground call through the proxy takes for a redirect it
 * did not follow: the statuses `fetch` follows, and a stream's refusal that
 * carries one as 4000 and the status. A 300 or a 304 names nothing to go to.
 */
import { RealtimeError } from "@noverax/courier";
import { describe, expect, it } from "vitest";

import {
  isRedirectStatus,
  isStreamRedirect,
  streamRedirectAdvice,
} from "../src/runtime/proxy-redirect";

describe("a redirect a Playground call did not follow", () => {
  it("is an answer with a status fetch follows", () => {
    expect([301, 302, 303, 307, 308].map(isRedirectStatus)).toEqual([true, true, true, true, true]);
    expect([200, 300, 304, 399, 400].map(isRedirectStatus)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("is a stream's refusal coded 4000 and one of those statuses", () => {
    expect(isStreamRedirect(new RealtimeError(4302, "Found"))).toBe(true);
    expect(isStreamRedirect(new RealtimeError(4308, "Permanent Redirect"))).toBe(true);
    expect(isStreamRedirect(new RealtimeError(4304, "Not Modified"))).toBe(false);
    expect(isStreamRedirect(new RealtimeError(4403, "Forbidden"))).toBe(false);
    expect(isStreamRedirect("4302")).toBe(false);
  });

  it("is told, for a stream, what to change whether the route or the API answered with it", () => {
    const advice = streamRedirectAdvice();

    expect(advice).toContain("proxyPath");
    expect(advice).toContain("COURIER_APP_URL");
    expect(advice).toContain("baseURL");
    expect(advice).toContain('redirect: "follow"');
  });
});

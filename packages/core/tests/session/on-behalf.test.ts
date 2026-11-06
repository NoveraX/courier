/**
 * The mark that a proxy request made in the server's own process is made
 * for the request being served, which the proxy takes the session from.
 */
import { describe, expect, it, vi } from "vitest";
import { onBehalfOf, serveOnBehalf } from "../../src/server/session/on-behalf";
import type { IncomingRequest } from "../../src/session/incoming-request";

const PROXY = "http://127.0.0.1/api/request";

function incoming(): IncomingRequest {
  return { key: {}, method: "GET", headers: new Headers({ cookie: "sid=a1" }) };
}

describe("serveOnBehalf", () => {
  it("marks a proxy request as made for the request being served", () => {
    const request = new Request(PROXY);
    const served = incoming();

    serveOnBehalf(request, served);

    expect(onBehalfOf(request)).toBe(served);
  });

  it("leaves every other request unmarked", () => {
    serveOnBehalf(new Request(PROXY), incoming());

    expect(onBehalfOf(new Request(PROXY))).toBeUndefined();
    expect(onBehalfOf(undefined)).toBeUndefined();
  });

  it("is found by another copy of Courier, as a page's own bundle may carry one", async () => {
    vi.resetModules();
    const other = await import("../../src/server/session/on-behalf");
    const request = new Request(PROXY);
    const served = incoming();

    serveOnBehalf(request, served);

    expect(other.onBehalfOf).not.toBe(onBehalfOf);
    expect(other.onBehalfOf(request)).toBe(served);
  });
});

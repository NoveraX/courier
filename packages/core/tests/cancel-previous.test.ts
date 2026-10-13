/**
 * The table of calls in flight that a newer call to the same endpoint
 * cancels: the newer call's controller takes the endpoint over at once, the
 * older call is cancelled with a 499 when the newer one has started, and a
 * call that ends forgets only its own entry.
 */
import { describe, expect, it, vi } from "vitest";

import { HTTPError } from "../src/errors";
import { studioHooks } from "../src/studio";
import { forgetCall, supersedeCall, supportsAbortController } from "../src/utils/cancel-previous";

function table() {
  return { pendingRequests: {} as Record<string, AbortController> };
}

describe("supportsAbortController", () => {
  it("is true in Node.js", () => {
    expect(supportsAbortController).toBe(true);
  });
});

describe("supersedeCall", () => {
  it("keeps the new call's controller under the endpoint", () => {
    const host = table();

    const { controller } = supersedeCall(host, "api:users.search");

    expect(host.pendingRequests["api:users.search"]).toBe(controller);
    expect(controller.signal.aborted).toBe(false);
  });

  it("cancels the call still in flight only when asked, with a 499, and tells Studio", () => {
    const host = table();
    const cancelled = vi.fn();
    const superseded = vi.fn();
    studioHooks.onCallSuperseded = cancelled;
    studioHooks.onRequestAbort = superseded;
    const first = supersedeCall(host, "api:users.search").controller;

    const second = supersedeCall(host, "api:users.search");
    const abortedBeforeAsked = first.signal.aborted;
    second.cancelSuperseded();

    expect(abortedBeforeAsked).toBe(false);
    expect(first.signal.aborted).toBe(true);
    expect(first.signal.reason).toBeInstanceOf(HTTPError);
    expect((first.signal.reason as HTTPError).status).toBe(499);
    expect(second.controller.signal.aborted).toBe(false);
    expect(superseded).toHaveBeenCalledWith(expect.objectContaining({ reason: "superseded" }));
    expect(cancelled).toHaveBeenCalledWith(expect.objectContaining({ key: "api:users.search" }));
    studioHooks.onCallSuperseded = undefined;
    studioHooks.onRequestAbort = undefined;
  });

  it("cancels nothing for the first call to an endpoint", () => {
    const host = table();
    const superseded = vi.fn();
    studioHooks.onRequestAbort = superseded;

    supersedeCall(host, "api:users.search").cancelSuperseded();

    expect(superseded).not.toHaveBeenCalled();
    studioHooks.onRequestAbort = undefined;
  });

  it("leaves the calls to other endpoints alone", () => {
    const host = table();
    const search = supersedeCall(host, "api:users.search").controller;

    supersedeCall(host, "api:geo.suggest").cancelSuperseded();

    expect(search.signal.aborted).toBe(false);
  });
});

describe("forgetCall", () => {
  it("removes the call's own entry", () => {
    const host = table();
    const { controller } = supersedeCall(host, "api:users.search");

    forgetCall(host, "api:users.search", controller);

    expect(host.pendingRequests["api:users.search"]).toBeUndefined();
  });

  it("leaves the entry of a newer call that took the endpoint", () => {
    const host = table();
    const older = supersedeCall(host, "api:users.search").controller;
    const newer = supersedeCall(host, "api:users.search").controller;

    forgetCall(host, "api:users.search", older);

    expect(host.pendingRequests["api:users.search"]).toBe(newer);
  });
});

/**
 * A proxied request whose caller goes away before the upstream answers.
 *
 * The proxy used to run the upstream call to completion anyway, so a page
 * that navigated or cancelled its queries left the server holding upstream
 * connections nobody was waiting for.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { courier, defineApi } from "../src/define/index";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { endpoint } = courier();
let upstreamSignal: AbortSignal | undefined;
let upstreamCalled = false;

beforeEach(() => {
  registerSources({
    api: defineApi({
      baseURL: "https://upstream.example",
      endpoints: { slow: endpoint.get("slow").response<unknown>() },
    }),
  });
  vi.stubGlobal("fetch", (input: Request | string, init?: RequestInit) => {
    upstreamCalled = true;
    upstreamSignal = input instanceof Request ? input.signal : (init?.signal ?? undefined);
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(Response.json({ ok: true })), 2000);
      upstreamSignal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(upstreamSignal?.reason);
      });
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
  upstreamSignal = undefined;
  upstreamCalled = false;
});

describe("a caller that leaves before the upstream answers", () => {
  it("cancels the upstream request", async () => {
    const caller = new AbortController();
    const pending = createHandler().handleGet(
      new Request("http://app.local/api/request?_s=api&_m=slow", { signal: caller.signal }),
    );

    await vi.waitFor(() => expect(upstreamCalled).toBe(true));
    caller.abort();
    await pending;

    expect(upstreamSignal?.aborted).toBe(true);
  });

  it("leaves a caller that stays to get its answer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const pending = createHandler().handleGet(
      new Request("http://app.local/api/request?_s=api&_m=slow"),
    );
    await vi.waitFor(() => expect(upstreamCalled).toBe(true));
    vi.advanceTimersByTime(2000);
    vi.useRealTimers();

    const response = await pending;
    expect(response.status).toBe(200);
    expect(upstreamSignal?.aborted ?? false).toBe(false);
  });
});

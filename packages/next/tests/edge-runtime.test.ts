/**
 * The route handlers on a platform without `AbortSignal.any`, which is what
 * a route with `export const runtime = "edge"` runs on.
 *
 * `sseRoute` promises to work in the Edge Runtime, and every stream there
 * answered 500 "AbortSignal.any is not a function"; a proxied call with a
 * timeout failed the same way and came back as 502 UPSTREAM_UNREACHABLE.
 */
import { registerSources } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRoute } from "../src/api-route";
import { sseRoute } from "../src/sse-route";

const { endpoint, stream } = courier();

/** The platform's AbortSignal, without `any`. */
function withoutAbortSignalAny(): void {
  const { any: _dropped, ...rest } = Object.getOwnPropertyDescriptors(AbortSignal);
  vi.stubGlobal(
    "AbortSignal",
    Object.defineProperties(function EdgeAbortSignal() {}, rest),
  );
}

beforeEach(() => {
  const ticks = stream.response<number>().implement(async function* () {
    yield { data: 1 };
  });
  const users = defineGroup({ prefix: "users", endpoints: { list: endpoint.get("") } });
  registerSources({
    api: defineApi({ baseURL: "https://upstream.example", groups: { users }, endpoints: { ticks } }),
  });
  withoutAbortSignalAny();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("route handlers without AbortSignal.any", () => {
  it("stream SSE", async () => {
    const request = new NextRequest("http://app.localhost/api/sse?_s=api&_m=ticks", {
      headers: { accept: "text/event-stream" },
    });

    const response = await sseRoute().GET(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("data: 1");
  });

  it("forward a call that sets a timeout", async () => {
    vi.stubGlobal("fetch", async () => Response.json([{ id: 1 }]));
    const request = new NextRequest("http://app.localhost/api/request?_s=api&_g=users&_m=list", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ options: { timeout: 5000 } }),
    });

    const response = await apiRoute().POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: 1 }]);
  });
});

/**
 * What the Astro handler tells an attached Studio.
 *
 * It announced nothing, so Studio never learned that the application served
 * its sources: the binding stayed orphaned, and the Playground could not run
 * an endpoint in the process that serves it.
 */
import { registerSources } from "@noverax/courier";
import { type BufferedAnnouncement, consumeAnnouncements } from "@noverax/courier/announce";
import { courier, defineApi, getSourceName } from "@noverax/courier/define";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetAnnouncements } from "../../core/src/announce/test-support";
import { courierHandler } from "../src/index";

afterEach(() => {
  vi.unstubAllGlobals();
  resetAnnouncements();
});

describe("the Astro handler", () => {
  it("tells Studio on its first request which sources it serves", async () => {
    const { endpoint } = courier();
    registerSources({
      api: defineApi({
        baseURL: "https://upstream.example",
        endpoints: { ping: endpoint.get("ping") },
      }),
    });
    vi.stubGlobal("fetch", async () => Response.json({ ok: true }));
    const announced: BufferedAnnouncement[] = [];
    const stop = consumeAnnouncements((entry) => announced.push(entry));
    const handler = courierHandler();

    for (let i = 0; i < 2; i++) {
      await handler({ request: new Request("http://app.test/api/request?_s=api&_m=ping") });
    }
    stop();

    expect(announced.map((a) => [a.transports, a.framework, a.sources.map(getSourceName)])).toEqual(
      [[["http", "sse"], "astro", ["api"]]],
    );
  });
});

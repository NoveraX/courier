/**
 * What the Remix handler tells an attached Studio.
 *
 * It names the sources it serves on its first request, so Studio binds them
 * to the application and the Playground can run an endpoint in the process
 * that serves it, rather than leaving the binding orphaned.
 */
import { registerSources, setAppOrigin } from "@noverax/courier";
import { type BufferedAnnouncement, consumeAnnouncements } from "@noverax/courier/announce";
import { courier, defineApi, getSourceName } from "@noverax/courier/define";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetAnnouncements } from "../../core/src/announce/test-support";
import { courierHandler } from "../src/index";

afterEach(() => {
  vi.unstubAllGlobals();
  resetAnnouncements();
  setAppOrigin(undefined);
});

describe("the Remix handler", () => {
  it("tells Studio which sources it serves, and no origin, which no request can prove", async () => {
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

    /* React Router tells neither the port nor the peer: no Host proves it names this server. */
    const sent = (host: string) =>
      new Request(`http://${host}/api/request?_s=api&_m=ping`, { headers: { host } });
    await handler({ request: sent("app.test") });
    for (let i = 0; i < 2; i++) await handler({ request: sent("localhost:4321") });
    stop();

    /* Once, as the sources are there: no request teaches the app's origin. */
    expect(
      announced.map((a) => [
        a.transports,
        a.framework,
        a.sources.map(getSourceName),
        a.listenOrigin,
      ]),
    ).toEqual([[["http", "sse"], "remix", ["api"], undefined]]);
  });
});

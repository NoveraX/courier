/**
 * What `courierWSHandler` hands back beside the handler of each socket: the
 * WebSocket handler's connections, a destroy for shutdown — which closes
 * them and lets go of the handler's pub/sub subscriptions — and its stats.
 */
import { registerSources } from "@noverax/courier";
import { defineApi } from "@noverax/courier/define";
import { createMemoryBus } from "@noverax/courier/realtime";
import { beforeEach, describe, expect, it } from "vitest";

import { courierWSHandler } from "../src";

beforeEach(() => {
  registerSources({ api: defineApi({ baseURL: "https://upstream.example", endpoints: {} }) });
});

describe("what courierWSHandler hands back", () => {
  it("carries the handler's connections, a destroy for shutdown, and its stats", async () => {
    const route = courierWSHandler();

    expect(route.connections).toMatchObject({
      broadcast: expect.any(Function),
      disconnect: expect.any(Function),
      requireAuth: expect.any(Function),
    });
    expect(route.stats()).toMatchObject({ connections: 0, stopping: false });

    await route.destroy({ timeoutMs: 100 });
    expect(route.stats().stopping).toBe(true);
  });

  it("lets go of the handler's pub/sub subscriptions once destroyed", async () => {
    const pubsub = createMemoryBus().replica("replica");
    const route = courierWSHandler({ pubsub });
    expect(pubsub.stats().channels.wanted).toBeGreaterThan(0);

    await route.destroy({ timeoutMs: 100 });

    expect(pubsub.stats().channels.wanted).toBe(0);
  });
});

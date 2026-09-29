/**
 * Stopping a mock server — as Studio does on every restart — closed every
 * connection at once, so a request in the middle of its latency got no
 * answer. It is answered now, while an event stream, which never finishes on
 * its own, is ended at once rather than held until the grace runs out.
 */
import { afterEach, describe, expect, it } from "vitest";

import { createMockServer } from "../src/server/create-mock-server";

let stop: (() => Promise<void>) | undefined;

afterEach(async () => {
  await stop?.();
  stop = undefined;
});

async function serve(configure: (server: ReturnType<typeof createMockServer>) => void) {
  const server = createMockServer({ port: 0, log: false });
  configure(server);
  const { url } = await server.start();
  stop = () => server.stop();
  return { server, url };
}

describe("a mock server that stops", () => {
  it("answers the request it is in the middle of", async () => {
    const { server, url } = await serve((mock) => {
      mock
        .mock("users", "list")
        .delay(300)
        .resolves([{ id: 1 }]);
    });

    const call = fetch(`${url}/api/request?_s=api&_g=users&_m=list`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const stopped = server.stop();
    stop = undefined;
    const response = await call;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: 1 }]);
    await stopped;
  });

  it("ends an open event stream at once instead of waiting it out", async () => {
    const { server, url } = await serve((mock) => {
      mock.mock("live", "ticks").stream(async function* () {
        yield { data: 1 };
        await new Promise(() => {});
      });
    });
    const response = await fetch(`${url}/api/sse?_s=api&_g=live&_m=ticks`);
    const reader = response.body?.getReader();
    await reader?.read();

    const started = performance.now();
    await server.stop();
    stop = undefined;

    expect(performance.now() - started).toBeLessThan(1_000);
    await expect(reader?.read()).resolves.toMatchObject({ done: true });
  });
});

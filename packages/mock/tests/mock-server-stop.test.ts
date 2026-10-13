/**
 * Stopping a mock server — as Studio does on every restart — answers a
 * request it is in the middle of answering rather than closing its
 * connection, while an event stream, which never finishes on its own, is
 * ended at once rather than held until the grace runs out.
 */
import { connect } from "node:net";
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

/** Whether the server at `url` still takes a new connection. */
function takesConnections(url: string): Promise<boolean> {
  const { hostname, port } = new URL(url);
  return new Promise((resolve) => {
    const socket = connect({ host: hostname, port: Number(port) });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

describe("a mock server that stops", () => {
  it("answers the request it is in the middle of", async () => {
    /* The handler holds the request until the server has stopped taking
       connections: stopped any earlier, the request might not have reached
       it yet, and an answer sent any earlier would not show that stopping
       waits for it. */
    let reached = (): void => undefined;
    const handling = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { server, url } = await serve((mock) => {
      mock.mock("users", "list").returns(async () => {
        reached();
        await held;
        return [{ id: 1 }];
      });
    });

    const call = fetch(`${url}/api/request?_s=api&_g=users&_m=list`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    await handling;
    const stopped = server.stop();
    stop = undefined;
    await expect.poll(() => takesConnections(url), { timeout: 4_000 }).toBe(false);
    release();
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

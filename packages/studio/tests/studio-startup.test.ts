/**
 * Where Studio listens, and when. Pinned to a host and a port it listens at
 * once; otherwise it waits for the config its first load reads, so the config
 * is evaluated once at start, and holds the process open meanwhile. What the
 * pins leave comes from the config's `studio` block, else the defaults, and
 * `onStarted` is told only once Studio listens and that load's outcome is in.
 */
import { createServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import type { CourierConfig } from "@noverax/courier/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioStartup, type StudioStartupOptions } from "../src/server/studio-startup";
import type { StudioStarted } from "../src/server/types";

const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  vi.restoreAllMocks();
});

async function freePort(): Promise<number> {
  const probe = createNetServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  if (address === null || typeof address === "string") throw new Error("no port");
  return address.port;
}

function httpServer(): Server {
  const server = createServer((_request, response) => response.end("studio"));
  servers.push(server);
  return server;
}

function config(studio: CourierConfig["studio"]): CourierConfig {
  return { sources: {}, ...(studio === undefined ? {} : { studio }) };
}

/** A startup, and every `onStarted` it told. */
function startup(server: Server, options: StudioStartupOptions = {}) {
  const started: StudioStarted[] = [];
  const handle = createStudioStartup(server, {
    ...options,
    onStarted: (event) => started.push(event),
  });
  return { handle, started };
}

async function until(check: () => boolean): Promise<void> {
  for (let waited = 0; waited < 5_000; waited += 10) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out");
}

/** Whether nothing listens on the port at the address, found by listening there. */
async function free(port: number, host: string): Promise<boolean> {
  const probe = createNetServer();
  const listened = await new Promise<boolean>((resolve) => {
    probe.once("error", () => resolve(false));
    probe.listen(port, host, () => resolve(true));
  });
  if (listened) await new Promise<void>((resolve) => probe.close(() => resolve()));
  return listened;
}

function holds(): number {
  return process.getActiveResourcesInfo().filter((kind) => kind === "Timeout").length;
}

describe("Studio pinned to a host and a port", () => {
  it("listens at once, and tells onStarted only once the config is read", async () => {
    const server = httpServer();
    const port = await freePort();
    const { handle, started } = startup(server, { port, host: "127.0.0.1" });

    handle.start();
    await until(() => handle.port() !== null);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(started).toEqual([]);

    handle.configRead(config({ port: 7999, open: true }));
    await until(() => started.length > 0);

    expect(started).toEqual([
      {
        url: `http://127.0.0.1:${port}`,
        host: "127.0.0.1",
        port,
        studio: { port: 7999, open: true },
      },
    ]);
  });

  it("does not hold the process open while the first load runs", () => {
    const before = holds();
    const { handle } = startup(httpServer(), { port: 0, host: "127.0.0.1" });

    handle.start();

    expect(holds()).toBe(before);
  });

  it("tells onStarted after the first outcome is applied, not while it is", async () => {
    const server = httpServer();
    const order: string[] = [];
    const handle = createStudioStartup(server, {
      port: 0,
      host: "127.0.0.1",
      onStarted: () => order.push("started"),
    });
    handle.start();
    await until(() => handle.port() !== null);

    handle.configRead(config(undefined));
    order.push("applied");
    await until(() => order.length === 2);

    expect(order).toEqual(["applied", "started"]);
  });
});

describe("Studio with less pinned", () => {
  it("does not listen before the config is read, then listens where its studio block says", async () => {
    const server = httpServer();
    const port = await freePort();
    const { handle, started } = startup(server);

    handle.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(server.listening).toBe(false);
    handle.configRead(config({ host: "127.0.0.1", port }));
    await until(() => started.length > 0);

    expect(started[0]).toMatchObject({ url: `http://127.0.0.1:${port}`, host: "127.0.0.1", port });
    expect(await fetch(`http://127.0.0.1:${port}/`).then((r) => r.text())).toBe("studio");
  });

  it("takes what the pins leave from the config, and a pin over the config", async () => {
    const server = httpServer();
    const port = await freePort();
    const { handle, started } = startup(server, { port });

    handle.start();
    handle.configRead(config({ host: "127.0.0.1", port: 1 }));
    await until(() => started.length > 0);

    expect(started[0]).toMatchObject({ host: "127.0.0.1", port });
  });

  it("listens where the pins and the defaults say when the first load failed", async () => {
    const server = httpServer();
    const port = await freePort();
    const { handle, started } = startup(server, { port });

    handle.start();
    handle.configRead(null);
    await until(() => started.length > 0);

    expect(started[0]).toMatchObject({ host: "localhost", port, studio: {} });
  });

  it("holds the process open from start until it listens", () => {
    const before = holds();
    const { handle } = startup(httpServer(), { port: 0 });

    handle.start();
    const waiting = holds();
    handle.configRead(config(undefined));

    expect(waiting).toBe(before + 1);
    expect(holds()).toBe(before);
  });

  it("never listens once closed, and lets the process go", async () => {
    const server = httpServer();
    const before = holds();
    const { handle, started } = startup(server, { port: 0 });

    handle.start();
    const closing = handle.close();
    const afterClose = holds();
    await closing;
    handle.configRead(config({ host: "127.0.0.1" }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(afterClose).toBe(before);
    expect(server.listening).toBe(false);
    expect(started).toEqual([]);
  });

  it("reports an address it cannot listen at to onError, and stops holding the process", async () => {
    const holder = createNetServer();
    await new Promise<void>((resolve) => holder.listen(0, "127.0.0.1", resolve));
    const taken = (holder.address() as { port: number }).port;
    const errors: Error[] = [];
    const handle = createStudioStartup(httpServer(), {
      port: taken,
      onError: (error) => errors.push(error),
    });

    const before = holds();
    handle.start();
    handle.configRead(config({ host: "127.0.0.1" }));
    const afterListen = holds();
    await until(() => errors.length > 0);
    await new Promise<void>((resolve) => holder.close(() => resolve()));

    expect(errors[0]?.message).toContain(String(taken));
    expect(afterListen).toBe(before);
  });
});

describe("Studio closed while it starts to listen", () => {
  it("waits for the listen under way, tells no one it is ready, and leaves nothing listening once the server closes", async ({
    skip,
  }) => {
    if (!(await free(0, "::1"))) skip();
    const server = httpServer();
    const port = await freePort();
    const told = vi.fn();
    const handle = createStudioStartup(server, {
      port,
      host: "localhost",
      onReady: told,
      onStarted: told,
    });
    handle.configRead(config(undefined));
    /* The primary address listens, and the second loopback one is still binding. */
    const closing = new Promise<void>((resolve) => {
      server.once("listening", () => resolve(handle.close()));
    });

    handle.start();
    await closing;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(told).not.toHaveBeenCalled();
    expect(await free(port, "127.0.0.1")).toBe(true);
    expect(await free(port, "::1")).toBe(true);
  });
});

describe("where Studio assigns mock ports from", () => {
  it("is the pin, else the config's studio.mockBasePort once read, else 7001", () => {
    const fromConfig = createStudioStartup(httpServer(), {});
    const pinned = createStudioStartup(httpServer(), { mockBasePort: 7300 });

    expect(fromConfig.mockBasePort()).toBe(7001);
    fromConfig.configRead(config({ mockBasePort: 7200 }));
    pinned.configRead(config({ mockBasePort: 7200 }));

    expect(fromConfig.mockBasePort()).toBe(7200);
    expect(pinned.mockBasePort()).toBe(7300);
  });

  it("is read from the first load only", () => {
    const handle = createStudioStartup(httpServer(), {});

    handle.configRead(config({ mockBasePort: 7200 }));
    handle.configRead(config({ mockBasePort: 7400 }));

    expect(handle.mockBasePort()).toBe(7200);
  });
});

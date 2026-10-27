/**
 * The search for a port to listen on moves past a port the system keeps for
 * itself, as Windows refuses a port in a range it reserves with EACCES. It
 * stops at a privileged port, which every port up to 1024 would refuse too,
 * and at the one port a caller must have.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import { tryListen } from "../../src/server/try-listen";

const listening: Server[] = [];

afterEach(async () => {
  for (const server of listening.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

/* `serve` from @hono/node-server on a system that keeps the `reserved` ports
   for itself: a bind there fails with EACCES, as Windows fails one in a range
   it reserves, and any other port is listened on for real. */
function serveReserving(reserved: ReadonlySet<number>, tried: number[]) {
  return (
    options: { port: number; hostname: string },
    listened: (info: { port: number }) => void,
  ): Server => {
    tried.push(options.port);
    const server = createServer();
    if (reserved.has(options.port)) {
      const message = `listen EACCES: permission denied ${options.hostname}:${options.port}`;
      const refusal = Object.assign(new Error(message), { code: "EACCES" });
      setImmediate(() => server.emit("error", refusal));
      return server;
    }
    server.listen(options.port, options.hostname, () => {
      listening.push(server);
      listened({ port: options.port });
    });
    return server;
  };
}

describe("the search for a port to listen on", () => {
  it("moves past a port the system keeps for itself, as Windows refuses one it reserves", async () => {
    const reserved = await freePort();
    const tried: number[] = [];

    const { port } = await tryListen(
      serveReserving(new Set([reserved]), tried),
      new Hono(),
      reserved,
      "localhost",
      () => undefined,
    );

    expect(tried[0]).toBe(reserved);
    expect(port).toBeGreaterThan(reserved);
    expect(tried.at(-1)).toBe(port);
  });

  it("stops at a privileged port, which every port up to 1024 would refuse too", async () => {
    const tried: number[] = [];

    const listened = tryListen(
      serveReserving(new Set([1023]), tried),
      new Hono(),
      1023,
      "localhost",
      () => undefined,
    );

    await expect(listened).rejects.toMatchObject({ code: "EACCES" });
    expect(tried).toEqual([1023]);
  });

  it("stops at a reserved port the caller must have exactly", async () => {
    const reserved = await freePort();
    const tried: number[] = [];

    const listened = tryListen(
      serveReserving(new Set([reserved]), tried),
      new Hono(),
      reserved,
      "localhost",
      () => undefined,
      0,
    );

    await expect(listened).rejects.toMatchObject({ code: "EACCES" });
    expect(tried).toEqual([reserved]);
  });
});

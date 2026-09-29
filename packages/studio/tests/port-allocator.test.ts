/**
 * The port Studio assigns a mock is one no other process listens on, on any
 * address, and none held for another mock.
 */
import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { allocatePort } from "../src/server/mock-manager/port-allocator";

const held: Server[] = [];

afterEach(async () => {
  await Promise.all(
    held.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

const ipv6 = await new Promise<boolean>((resolve) => {
  const probe = createServer();
  probe.once("error", () => resolve(false));
  probe.listen({ port: 0, host: "::1", ipv6Only: true }, () => probe.close(() => resolve(true)));
});

async function holdOn(host: string): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen({ port: 0, host }, resolve));
  held.push(server);
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("The holder has no port.");
  return address.port;
}

async function freePort(): Promise<number> {
  const port = await holdOn("127.0.0.1");
  await new Promise((resolve) => held.pop()?.close(resolve));
  return port;
}

describe("allocatePort", () => {
  it("assigns the preferred port when it is free", async () => {
    const port = await freePort();

    expect(await allocatePort(port, new Set())).toBe(port);
  });

  it("skips a port held for another mock", async () => {
    const port = await freePort();

    expect(await allocatePort(port, new Set([port]))).toBeGreaterThan(port);
  });

  it("skips a port another process listens on at 0.0.0.0", async () => {
    const port = await holdOn("0.0.0.0");

    expect(await allocatePort(port, new Set())).toBeGreaterThan(port);
  });

  it.skipIf(!ipv6)("skips a port another process listens on at ::", async () => {
    const port = await holdOn("::");

    expect(await allocatePort(port, new Set())).toBeGreaterThan(port);
  });
});

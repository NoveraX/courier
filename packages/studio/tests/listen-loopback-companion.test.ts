/**
 * The second loopback address Studio listens on: it answers what the primary
 * answers, closes with the primary — at once when the primary closed while it
 * was still binding — is skipped on a machine without that address, and
 * reports any other listen error.
 */
import { createServer, type Server } from "node:http";
import { createServer as createNetServer, type Server as NetServer } from "node:net";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { listenLoopbackCompanion } from "../src/server/listen-loopback-companion";

const servers: Array<Server | NetServer> = [];
let ipv6 = false;

async function bound(server: NetServer | Server, port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    server.once("error", () => resolve(false));
    server.listen(port, host, () => resolve(true));
  });
}

/** Whether nothing listens on the port at the address, found by listening there. */
async function free(port: number, host: string): Promise<boolean> {
  const probe = createNetServer();
  const listened = await bound(probe, port, host);
  if (listened) await new Promise<void>((resolve) => probe.close(() => resolve()));
  return listened;
}

async function primary(): Promise<{ server: Server; port: number }> {
  const server = createServer((_request, response) => response.end("primary"));
  servers.push(server);
  await bound(server, 0, "127.0.0.1");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return { server, port: address.port };
}

beforeAll(async () => {
  const probe = createNetServer();
  ipv6 = await bound(probe, 0, "::1");
  if (ipv6) await new Promise<void>((resolve) => probe.close(() => resolve()));
});

afterEach(async () => {
  for (const server of servers.splice(0)) {
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("listenLoopbackCompanion", () => {
  it("answers at the second address what the primary answers", async ({ skip }) => {
    if (!ipv6) skip();
    const { port, server } = await primary();

    await listenLoopbackCompanion(server, port, "::1");

    expect(await fetch(`http://[::1]:${port}/`).then((r) => r.text())).toBe("primary");
  });

  it("closes with the primary", async ({ skip }) => {
    if (!ipv6) skip();
    const { port, server } = await primary();
    await listenLoopbackCompanion(server, port, "::1");

    await new Promise<void>((resolve) => server.close(() => resolve()));

    expect(await free(port, "::1")).toBe(true);
  });

  it("closes at once when the primary closed while it was binding", async ({ skip }) => {
    if (!ipv6) skip();
    const { port, server } = await primary();

    const companion = listenLoopbackCompanion(server, port, "::1");
    server.close();
    await companion;

    expect(await free(port, "::1")).toBe(true);
  });

  it("is skipped on a machine without the address", async () => {
    const { port, server } = await primary();

    await expect(listenLoopbackCompanion(server, port, "::2")).resolves.toBeUndefined();
  });

  it("reports any other listen error", async ({ skip }) => {
    if (!ipv6) skip();
    const { port, server } = await primary();
    const holder = createNetServer();
    servers.push(holder);
    await bound(holder, port, "::1");

    await expect(listenLoopbackCompanion(server, port, "::1")).rejects.toMatchObject({
      code: "EADDRINUSE",
    });
  });
});

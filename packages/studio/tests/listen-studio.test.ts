/**
 * Studio on its default host, `localhost`, answers on both loopback
 * addresses. Bound to the name, it listened on whichever address the
 * resolver gave first — `::1` on macOS — so a client that dialled
 * `127.0.0.1`, as a container forward or a tool does, was refused, while
 * the mock servers Studio starts listen on `127.0.0.1`.
 */
import { createServer as createNetServer, type Server } from "node:net";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io as connect } from "socket.io-client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioServer } from "../src/server/create-studio-server";
import type { StudioServer } from "../src/server/types";

let root: string;
let studio: StudioServer | undefined;
let ipv6 = false;
const holders: Server[] = [];

async function listening(port: number, host: string): Promise<Server | null> {
  const server = createNetServer();
  return new Promise((resolve) => {
    server.once("error", () => resolve(null));
    server.listen(port, host, () => resolve(server));
  });
}

async function freePort(): Promise<number> {
  const probe = await listening(0, "127.0.0.1");
  const address = probe?.address();
  if (probe === null || address === null || address === undefined || typeof address === "string") throw new Error("no port");
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return address.port;
}

beforeAll(async () => {
  const probe = await listening(0, "::1");
  ipv6 = probe !== null;
  await new Promise<void>((resolve) => (probe ? probe.close(() => resolve()) : resolve()));
});

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  root = realpathSync(mkdtempSync(join(tmpdir(), "courier-listen-")));
  writeFileSync(join(root, "courier.config.ts"), "export default { sources: {} };\n");
});

afterEach(async () => {
  await studio?.close();
  studio = undefined;
  for (const holder of holders.splice(0)) await new Promise<void>((resolve) => holder.close(() => resolve()));
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function start(port: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    studio = createStudioServer({ port, host: "localhost", projectRoot: root, onReady: resolve, onError: reject });
  });
}

describe("Studio on localhost", () => {
  it("answers at 127.0.0.1", async () => {
    const port = await freePort();
    const url = await start(port);

    const response = await fetch(`http://127.0.0.1:${port}/api/health`);

    expect(url).toBe(`http://localhost:${port}`);
    expect(response.status).toBe(200);
  });

  it("answers at [::1] where this machine has IPv6", async ({ skip }) => {
    if (!ipv6) skip();
    const port = await freePort();
    await start(port);

    const response = await fetch(`http://[::1]:${port}/api/health`);

    expect(response.status).toBe(200);
  });

  it("takes a runtime's socket at either address", async () => {
    const port = await freePort();
    await start(port);
    const hosts = ipv6 ? ["127.0.0.1", "[::1]"] : ["127.0.0.1"];

    for (const host of hosts) {
      const socket = connect(`http://${host}:${port}/runtime`, { transports: ["websocket"], reconnection: false });
      const connected = await new Promise<boolean>((resolve) => {
        socket.once("connect", () => resolve(true));
        socket.once("connect_error", () => resolve(false));
      });
      socket.close();
      expect(connected).toBe(true);
    }
  });

  it("does not start while another process holds the port at either address", async ({ skip }) => {
    if (!ipv6) skip();
    const port = await freePort();
    const holder = await listening(port, "::1");
    if (holder === null) throw new Error("could not hold the port");
    holders.push(holder);

    await expect(start(port)).rejects.toThrow(`Port ${port}`);
  });
});

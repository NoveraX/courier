/**
 * Where the mock server listens, who may drive its admin API, and how it
 * stops.
 *
 * `localhost` means the loopback, not every interface, and the admin API
 * refuses a page on another site: otherwise anyone on the network, or any
 * page the developer has open, could read the store, wipe it or switch
 * endpoints to 500. `stop()` closes WebSocket channels, each hearing
 * `onLeave`. A reset reports no active scenario, the scenario-state reset
 * route is reachable, and the history keeps only the most recent entries.
 */
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:net";
import { networkInterfaces } from "node:os";
import { encodeMessage } from "@noverax/courier/internal";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";

import { createHistory } from "../src/history";
import {
  createMockServer,
  type MockServer,
  type MockServerOptions,
} from "../src/server/create-mock-server";
import type { PrefixMapping } from "../src/server/prefix-route-types";

const running: MockServer[] = [];

afterEach(async () => {
  for (const server of running.splice(0)) await server.stop();
});

async function boot(
  options: Partial<MockServerOptions> = {},
): Promise<{ server: MockServer; url: string }> {
  const server = createMockServer({ port: 0, log: false, ...options });
  running.push(server);
  return { server, url: (await server.start()).url };
}

const ipv6Loopback = await new Promise<boolean>((resolve) => {
  const probe = createServer();
  probe.once("error", () => resolve(false));
  probe.listen({ port: 0, host: "::1", ipv6Only: true }, () => probe.close(() => resolve(true)));
});

async function holdOn(host: string): Promise<Server> {
  const other = createServer();
  await new Promise<void>((resolve) => other.listen({ port: 0, host }, resolve));
  return other;
}

function lanAddress(): string | undefined {
  for (const addresses of Object.values(networkInterfaces())) {
    const found = addresses?.find((a) => a.family === "IPv4" && !a.internal);
    if (found) return found.address;
  }
  return undefined;
}

describe("where the mock server listens", () => {
  it.skipIf(!lanAddress())("answers on loopback only when asked for localhost", async () => {
    const { url } = await boot({ hostname: "localhost" });
    const port = new URL(url).port;

    const local = await fetch(`http://127.0.0.1:${port}/__admin/health`);
    const fromLan = await fetch(`http://${lanAddress()}:${port}/__admin/health`).catch(
      (error: unknown) => error,
    );

    expect(local.status).toBe(200);
    expect(fromLan).toBeInstanceOf(Error);
  });

  it("moves to the next free port when its own is taken", async () => {
    const { url } = await boot();
    const taken = Number(new URL(url).port);

    const { url: next } = await boot({ port: taken });

    expect(Number(new URL(next).port)).toBeGreaterThan(taken);
  });

  it.skipIf(!ipv6Loopback)("counts a port another process holds on [::1] as taken", async () => {
    const other = createServer();
    await new Promise<void>((resolve) =>
      other.listen({ port: 0, host: "::1", ipv6Only: true }, resolve),
    );
    const taken = (other.address() as AddressInfo).port;
    const strict = createMockServer({ port: taken, strictPort: true, log: false });

    try {
      await expect(strict.start()).rejects.toMatchObject({ code: "EADDRINUSE" });
      const { url } = await boot({ port: taken });
      expect(Number(new URL(url).port)).not.toBe(taken);
    } finally {
      await new Promise((resolve) => other.close(resolve));
    }
  });

  it("counts a port another process holds on 0.0.0.0 as taken", async () => {
    const other = await holdOn("0.0.0.0");
    const taken = (other.address() as AddressInfo).port;
    const strict = createMockServer({ port: taken, strictPort: true, log: false });

    try {
      await expect(strict.start()).rejects.toMatchObject({ code: "EADDRINUSE" });
      const { url } = await boot({ port: taken });
      expect(Number(new URL(url).port)).toBeGreaterThan(taken);
    } finally {
      await new Promise((resolve) => other.close(resolve));
    }
  });

  it.skipIf(!ipv6Loopback)("counts a port another process holds on :: as taken", async () => {
    const other = await holdOn("::");
    const taken = (other.address() as AddressInfo).port;
    const strict = createMockServer({ port: taken, strictPort: true, log: false });

    try {
      await expect(strict.start()).rejects.toMatchObject({ code: "EADDRINUSE" });
      const { url } = await boot({ port: taken });
      expect(Number(new URL(url).port)).toBeGreaterThan(taken);
    } finally {
      await new Promise((resolve) => other.close(resolve));
    }
  });

  it("refuses a port another process holds on the loopback when it listens on every address", async () => {
    const other = await holdOn("127.0.0.1");
    const taken = (other.address() as AddressInfo).port;
    const strict = createMockServer({
      port: taken,
      hostname: "0.0.0.0",
      strictPort: true,
      log: false,
    });

    try {
      await expect(strict.start()).rejects.toMatchObject({ code: "EADDRINUSE" });
    } finally {
      await new Promise((resolve) => other.close(resolve));
    }
  });

  it("ends its connection to a server on the port that greets its clients without resetting it", async () => {
    const errors: string[] = [];
    let closed: () => void = () => undefined;
    const clientClosed = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const other = createServer((client) => {
      client.on("error", (err: NodeJS.ErrnoException) => errors.push(err.code ?? err.message));
      client.on("close", closed);
      client.end("hello\n");
    });
    await new Promise<void>((resolve) => other.listen({ port: 0, host: "0.0.0.0" }, resolve));
    const taken = (other.address() as AddressInfo).port;
    const strict = createMockServer({ port: taken, strictPort: true, log: false });

    try {
      await expect(strict.start()).rejects.toMatchObject({ code: "EADDRINUSE" });
      await clientClosed;
      expect(errors).toEqual([]);
    } finally {
      await new Promise((resolve) => other.close(resolve));
    }
  });

  it("refuses to start on a taken port it must hold exactly", async () => {
    const { url } = await boot();
    const taken = Number(new URL(url).port);
    const strict = createMockServer({ port: taken, strictPort: true, log: false });

    await expect(strict.start()).rejects.toMatchObject({ code: "EADDRINUSE" });
  });
});

describe("the admin API", () => {
  it("refuses a page on another site", async () => {
    const { url } = await boot();

    const response = await fetch(`${url}/__admin/reset`, {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });

    expect(response.status).toBe(403);
  });

  it("answers tools and pages served from this machine", async () => {
    const { url } = await boot();

    const tool = await fetch(`${url}/__admin/health`);
    const localPage = await fetch(`${url}/__admin/health`, {
      headers: { Origin: "http://localhost:5173" },
    });

    expect(tool.status).toBe(200);
    expect(localPage.status).toBe(200);
  });

  it("reaches the scenario-state reset route", async () => {
    const { url } = await boot();

    const response = await fetch(`${url}/__admin/scenarios/reset`, { method: "POST" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: "Started" });
  });

  it("reports no active scenario after a reset", async () => {
    const { url } = await boot({ scenarios: { down: { name: "down", apply: () => undefined } } });
    await fetch(`${url}/__admin/scenarios/down`, { method: "POST" });
    const before = await fetch(`${url}/__admin/scenarios`).then((r) => r.json());
    expect(before.current).toBe("down");

    await fetch(`${url}/__admin/reset`, { method: "POST" });
    const scenarios = await fetch(`${url}/__admin/scenarios`).then((r) => r.json());

    expect(scenarios.current).toBeNull();
  });
});

describe("stopping", () => {
  const chat: PrefixMapping[] = [
    {
      prefix: "/chat",
      group: "chat",
      methods: ["room"],
      endpoints: [
        { name: "room", operation: "custom", path: "", transport: "ws", isChannel: true },
      ],
    },
  ];

  it("closes open channels, and each hears onLeave", async () => {
    let left = 0;
    const server = createMockServer({ port: 0, log: false, admin: false, mappings: chat });
    server.mock("chat", "room").channel(() => ({
      onMessage: () => undefined,
      onLeave: () => {
        left += 1;
      },
    }));
    const { url } = await server.start();
    const client = new WebSocket(`${url.replace(/^http/, "ws")}/chat/room`);
    await new Promise((resolve) => client.once("open", resolve));
    client.send(encodeMessage({ type: "subscribe", topic: "chat.room", id: "s1" }));
    await new Promise((resolve) => client.once("message", resolve));
    const closed = new Promise<number>((resolve) => client.once("close", resolve));

    await server.stop();

    expect(await closed).toBe(1001);
    expect(left).toBe(1);
  });
});

describe("request history", () => {
  it("keeps only the most recent entries", () => {
    const history = createHistory(10);

    for (let i = 0; i < 40; i += 1) history.push({ method: `m${i}` } as never);

    expect(history.length).toBeLessThanOrEqual(13);
    expect(history.at(-1)?.method).toBe("m39");
  });
});

/**
 * What an edit of the mocks file changes that its diff does not show: a new
 * file, running mocks that restart, a second mock of a source, a port Studio
 * assigns, a port another mock moves off, and a port in use — on a loopback
 * or on every address.
 */
import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import type { LoadedCourierConfig } from "../../src/server/config-loader";
import { editWarnings, type WarningInput } from "../../src/server/mocks-edit/edit-warnings";

const api = { name: "api" };
const held: Server[] = [];

afterEach(async () => {
  await Promise.all(held.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

const ipv6 = await new Promise<boolean>((resolve) => {
  const probe = createServer();
  probe.once("error", () => resolve(false));
  probe.listen({ port: 0, host: "::1", ipv6Only: true }, () => probe.close(() => resolve(true)));
});

async function holdPort(host = "127.0.0.1"): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  held.push(server);
  return (server.address() as { port: number }).port;
}

async function freePort(): Promise<number> {
  const port = await holdPort();
  await new Promise((resolve) => held.pop()?.close(resolve));
  return port;
}

function input(overrides: Partial<WarningInput>): WarningInput {
  const loaded = {
    config: { sources: { api } },
    mocks: { entries: {} },
  } as unknown as LoadedCourierConfig;
  return {
    requests: [],
    loaded,
    summaries: [],
    target: "courier.mocks.ts",
    creates: false,
    mockBasePort: 7001,
    ...overrides,
  };
}

const request = (port: number | null) => ({ key: "apiMock", source: "api", port, seedCount: 20, autoStart: true });

describe("editWarnings", () => {
  it("says a new file is created", async () => {
    expect(await editWarnings(input({ creates: true }))).toEqual(["Studio creates courier.mocks.ts."]);
  });

  it("names the running mocks the reload restarts, and only those", async () => {
    const summaries = [
      { key: "users", alive: true, port: 7001, portDeclared: false },
      { key: "idle", alive: false, port: 7002, portDeclared: false },
      { key: "orders", alive: true, port: 7003, portDeclared: true },
    ];

    expect(await editWarnings(input({ summaries }))).toEqual([
      "Running mocks restart to pick up the edit: users, orders.",
    ]);
  });

  it("says a port Studio assigns can differ after a restart", async () => {
    expect(await editWarnings(input({ requests: [request(null)] }))).toEqual([
      "apiMock gets a port Studio assigns from 7001; it can differ after Studio restarts. Set a port to keep one.",
    ]);
  });

  it("says a source already has a mock, by the very source object", async () => {
    const loaded = {
      config: { sources: { api } },
      mocks: { entries: { first: { source: api }, lookalike: { source: { name: "api" } } } },
    } as unknown as LoadedCourierConfig;

    const warnings = await editWarnings(input({ loaded, requests: [request(await freePort())] }));

    expect(warnings).toEqual(["api already has the mock first; apiMock serves it too."]);
  });

  it("says which mock moves off a port Studio assigned it", async () => {
    const summaries = [{ key: "users", alive: false, port: 7444, portDeclared: false }];

    expect(await editWarnings(input({ summaries, requests: [request(7444)] }))).toEqual([
      "users moves to another port: apiMock takes 7444.",
    ]);
  });

  it("says a fixed port is in use now", async () => {
    const port = await holdPort();

    expect(await editWarnings(input({ requests: [request(port)] }))).toEqual([
      `Port ${port} is in use now, so apiMock cannot start until it is free.`,
    ]);
  });

  it("says a fixed port another process holds on 0.0.0.0 is in use now", async () => {
    const port = await holdPort("0.0.0.0");

    expect(await editWarnings(input({ requests: [request(port)] }))).toEqual([
      `Port ${port} is in use now, so apiMock cannot start until it is free.`,
    ]);
  });

  it.skipIf(!ipv6)("says a fixed port another process holds on :: is in use now", async () => {
    const port = await holdPort("::");

    expect(await editWarnings(input({ requests: [request(port)] }))).toEqual([
      `Port ${port} is in use now, so apiMock cannot start until it is free.`,
    ]);
  });

  it("says nothing for a free fixed port", async () => {
    expect(await editWarnings(input({ requests: [request(await freePort())] }))).toEqual([]);
  });
});

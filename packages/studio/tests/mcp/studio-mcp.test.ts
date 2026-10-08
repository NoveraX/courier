/**
 * Studio's MCP endpoint, as an editor's agent reaches it: with Studio's
 * token, over HTTP and through `courier-studio mcp` over stdio — the
 * requests Studio recorded, one in full with its secrets replaced, the mocks
 * and their scenarios, and switching one.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import {
  Client as ModernClient,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { Client as LegacyClient } from "@modelcontextprotocol/sdk/client/index.js";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bridgeToStudio } from "../../src/commands/mcp-bridge";
import { mountStudioMcp } from "../../src/server/mcp/mount-studio-mcp";

const TOKEN = "t".repeat(43);
const EVENTS = [
  {
    type: "request:start",
    id: "r1",
    source: "shop",
    group: "orders",
    method: "get",
    httpMethod: "GET",
    mode: "proxy",
    variables: { id: "7" },
    timestamp: 1,
  },
  {
    type: "request:end",
    requestId: "r1",
    status: 200,
    data: { id: "7", accessToken: "abc" },
    headers: { "set-cookie": "sid=1" },
    requestHeaders: { authorization: "Bearer secret" },
    timing: { total: 41 },
  },
  {
    type: "request:start",
    id: "r2",
    source: "shop",
    group: "orders",
    method: "cancel",
    httpMethod: "POST",
    mode: "direct",
    variables: { id: "8", password: "hunter2" },
    agent: { tool: "orders_cancel", access: "destructive" },
    timestamp: 2,
  },
  {
    type: "request:error",
    requestId: "r2",
    error: { type: "http", status: 409, message: "Order 8 has shipped" },
    status: 409,
  },
];
const commands: unknown[] = [];
const mocks = {
  describeServers: () => [
    {
      serverId: "shop",
      name: "shop",
      source: "shop",
      status: "running",
      url: "http://localhost:7101",
      activeScenario: null,
      scenarios: [{ name: "empty", description: "No orders" }],
    },
  ],
  forwardStoreCommand: (command: Record<string, unknown>) => {
    commands.push(command);
    return command.serverId === "shop" ? Promise.resolve({ ok: true }) : undefined;
  },
};

let server: Server;
let url: string;

beforeAll(async () => {
  const app = express();
  const token = { value: TOKEN, matches: (candidate: unknown) => candidate === TOKEN };
  mountStudioMcp(app, {
    token,
    version: "test",
    requestLog: { events: () => EVENTS },
    mocks: mocks as never,
  });
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function modern() {
  const client = new ModernClient(
    { name: "editor", version: "1" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { authorization: `Bearer ${TOKEN}` } },
    }) as never,
  );
  return client;
}

describe("Studio's MCP endpoint", () => {
  it("lists what Studio recorded, the failed calls alone when asked", async () => {
    const client = await modern();

    const { tools } = await client.listTools();
    const all = await client.callTool({ name: "requests", arguments: {} });
    const failed = await client.callTool({ name: "requests", arguments: { failed: true } });

    expect(tools.map((tool) => tool.name)).toEqual([
      "requests",
      "request",
      "mocks",
      "mock_scenario",
    ]);
    expect(
      (all.structuredContent as { requests: { id: string }[] }).requests.map((r) => r.id),
    ).toEqual(["r2", "r1"]);
    expect(failed.structuredContent).toMatchObject({
      requests: [
        {
          id: "r2",
          endpoint: "shop.orders.cancel",
          state: "error",
          status: 409,
          error: "Order 8 has shipped",
          agent: { tool: "orders_cancel" },
        },
      ],
    });
  });

  it("shows one request in full, every credential and secret replaced", async () => {
    const client = await modern();

    const result = await client.callTool({ name: "request", arguments: { id: "r1" } });
    const text = JSON.stringify(result.structuredContent);

    expect(result.structuredContent).toMatchObject({
      id: "r1",
      variables: { id: "7" },
      answer: { id: "7", accessToken: "[redacted]" },
    });
    expect(text).not.toContain("Bearer secret");
    expect(text).not.toContain("sid=1");
    expect(text).not.toContain('"abc"');
    expect(
      (await client.callTool({ name: "request", arguments: { id: "r2" } })).structuredContent,
    ).toMatchObject({ variables: { password: "[redacted]" } });
    expect((await client.callTool({ name: "request", arguments: { id: "nope" } })).isError).toBe(
      true,
    );
  });

  it("lists the mocks, and switches one's scenario as the Mocks view does", async () => {
    const client = await modern();

    const listed = await client.callTool({ name: "mocks", arguments: {} });
    const switched = await client.callTool({
      name: "mock_scenario",
      arguments: { mock: "shop", scenario: "empty" },
    });
    const unknown = await client.callTool({
      name: "mock_scenario",
      arguments: { mock: "nope", scenario: "empty" },
    });

    expect(listed.structuredContent).toMatchObject({
      mocks: [{ id: "shop", scenarios: [{ name: "empty" }] }],
    });
    expect(switched.isError).toBe(false);
    expect(commands).toContainEqual({
      action: "mock:scenario:apply",
      serverId: "shop",
      scenario: "empty",
    });
    expect(unknown.isError).toBe(true);
  });

  it("answers no one without Studio's token", async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer wrong" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });

    expect(response.status).toBe(401);
  });
});

describe("courier-studio mcp", () => {
  it("carries a stdio client on the 2025 handshake to Studio, with the token it read", async () => {
    const toBridge = new PassThrough();
    const fromBridge = new PassThrough();
    const bridged = bridgeToStudio({
      input: toBridge,
      write: (line) => fromBridge.write(`${line}\n`),
      url,
      token: TOKEN,
    });
    const transport = {
      onmessage: undefined as ((message: never) => void) | undefined,
      onclose: undefined as (() => void) | undefined,
      async start() {
        createInterface({ input: fromBridge }).on("line", (line) =>
          transport.onmessage?.(JSON.parse(line) as never),
        );
      },
      async send(message: unknown) {
        toBridge.write(`${JSON.stringify(message)}\n`);
      },
      async close() {
        toBridge.end();
        transport.onclose?.();
      },
    };
    const client = new LegacyClient({ name: "editor", version: "1" });
    await client.connect(transport as never);

    const failed = await client.callTool({ name: "requests", arguments: { failed: true } });
    await client.close();
    await bridged;

    expect(JSON.stringify(failed.content)).toContain("Order 8 has shipped");
  });

  it("tells the client Studio is not running, rather than hanging", async () => {
    const input = new PassThrough();
    const lines: string[] = [];
    const bridged = bridgeToStudio({
      input,
      write: (line) => lines.push(line),
      url: "http://127.0.0.1:9/mcp",
      token: TOKEN,
    });
    input.end(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })}\n`);
    await bridged;

    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      id: 1,
      error: { code: -32603, message: expect.stringContaining("npx courier-studio") },
    });
  });
});

/**
 * Studio's MCP endpoint, as an editor's agent reaches it: with Studio's
 * token, over HTTP and through `courier-studio mcp` over stdio — the
 * requests Studio recorded, one in full with its secrets replaced, its
 * audit of them, replays of a read and of a write a person confirms, the
 * mocks and their scenarios, and switching one.
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
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bridgeToStudio } from "../../src/commands/mcp-bridge";
import { mountStudioMcp } from "../../src/server/mcp/mount-studio-mcp";
import type { PlaygroundExecPayload } from "../../src/server/runtime-playground-router-sanitize";

const TOKEN = "t".repeat(43);
const EVENTS = [
  {
    type: "request:start",
    id: "r1",
    sessionId: "app",
    source: "shop",
    group: "orders",
    method: "get",
    httpMethod: "GET",
    endpointType: "query",
    mode: "proxy",
    variables: { id: "7" },
    middlewareCount: 0,
    hasValidation: { variables: false, response: false },
    timestamp: 1,
  },
  {
    type: "request:end",
    id: "e1",
    sessionId: "app",
    requestId: "r1",
    status: 200,
    data: { id: "7", accessToken: "abc" },
    headers: { "set-cookie": "sid=1" },
    requestHeaders: { authorization: "Bearer secret" },
    timing: { total: 41, middleware: 0, fetch: 40, validation: 0 },
    size: 30,
    timestamp: 42,
  },
  {
    type: "request:start",
    id: "r2",
    sessionId: "app",
    source: "shop",
    group: "orders",
    method: "cancel",
    httpMethod: "POST",
    endpointType: "mutation",
    mode: "direct",
    variables: { id: "8", password: "hunter2" },
    middlewareCount: 0,
    hasValidation: { variables: false, response: false },
    agent: { tool: "orders_cancel", access: "destructive" },
    timestamp: 2,
  },
  {
    type: "request:error",
    id: "e2",
    sessionId: "app",
    requestId: "r2",
    error: { type: "http", status: 409, message: "Order 8 has shipped" },
    status: 409,
    timing: { total: 12, middleware: 0, fetch: 12, validation: 0 },
    timestamp: 14,
  },
  {
    type: "request:start",
    id: "r3",
    sessionId: "app",
    source: "shop",
    group: "orders",
    method: "import",
    httpMethod: "POST",
    endpointType: "mutation",
    mode: "direct",
    variables: { lines: "…" },
    variablesCutFrom: 90_000,
    middlewareCount: 0,
    hasValidation: { variables: false, response: false },
    timestamp: 3,
  },
  {
    type: "request:start",
    id: "r4",
    sessionId: "app",
    source: "billing",
    method: "paid",
    httpMethod: "POST",
    mode: "webhook",
    variables: { type: "invoice.paid" },
    middlewareCount: 0,
    hasValidation: { variables: false, response: false },
    timestamp: 4,
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

const sent: PlaygroundExecPayload[] = [];
const stamped: Array<[string, unknown]> = [];
const replays = {
  run: async (call: PlaygroundExecPayload) => {
    sent.push(call);
    return {
      ok: true as const,
      chunks: [
        {
          kind: "http-result" as const,
          status: 200,
          data: { id: "7", accessToken: "fresh" },
          headers: { "set-cookie": "sid=2", "content-type": "application/json" },
        },
      ],
      durationMs: 18.4,
    };
  },
  wholeBody: async (asked: { requestId: string }) =>
    asked.requestId === "r3"
      ? { ok: true as const, data: JSON.stringify({ lines: "all of them" }) }
      : { ok: false as const, error: "The app did not send the body." },
};
const agentCalls = {
  expect: (requestId: string, agent: unknown) => stamped.push([requestId, agent]),
  forget: (requestId: string) => stamped.push([requestId, "forgotten"]),
  stamp: (event: Record<string, unknown>) => event,
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
    replays,
    agentCalls,
    audit: { declared: () => [], runtimes: () => [] },
  });
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const questions: string[] = [];

/* An editor's client; one given an answer declares it can ask a person, and answers each question so. */
async function modern(answer?: "accept" | "decline") {
  const client = new ModernClient(
    { name: "editor", version: "1" },
    {
      versionNegotiation: { mode: { pin: "2026-07-28" } },
      ...(answer && { capabilities: { elicitation: { form: {} } } }),
    },
  );
  if (answer) {
    client.setRequestHandler(
      "elicitation/create",
      async (request: { params: { message: string } }) => {
        questions.push(request.params.message);
        return { action: answer, content: {} };
      },
    );
  }
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
      "audit",
      "replay",
      "replay_write",
      "mocks",
      "mock_scenario",
    ]);
    expect(
      (all.structuredContent as { requests: { id: string }[] }).requests.map((r) => r.id),
    ).toEqual(["r4", "r3", "r2", "r1"]);
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

describe("Studio's audit and replays over MCP", () => {
  it("audits the recorded requests by the Audit page's own rules", async () => {
    const client = await modern();

    const audit = await client.callTool({ name: "audit", arguments: {} });
    const errors = await client.callTool({ name: "audit", arguments: { severity: "error" } });
    const aboutGet = await client.callTool({
      name: "audit",
      arguments: { endpoint: "orders.get" },
    });

    const all = audit.structuredContent as {
      score: number;
      requests: number;
      findings: { severity: string; endpoints?: { endpoint: string }[] }[];
    };
    expect(all.requests).toBe(4);
    expect(all.score).toBeGreaterThan(0);
    expect(all.findings.length).toBeGreaterThan(0);
    expect(all.findings.some((f) => f.severity === "pass")).toBe(false);
    const severe = (errors.structuredContent as typeof all).findings;
    expect(severe.every((f) => f.severity === "error")).toBe(true);
    expect(severe.some((f) => f.endpoints?.some((e) => e.endpoint === "shop.orders.cancel"))).toBe(
      true,
    );
    const shown = (aboutGet.structuredContent as typeof all).findings;
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((f) => f.endpoints?.some((e) => e.endpoint.includes("orders.get")))).toBe(
      true,
    );
  });

  it("sends a recorded read again as the inspector does, and names the agent on its record", async () => {
    sent.length = 0;
    stamped.length = 0;
    const client = await modern();

    const replayed = await client.callTool({ name: "replay", arguments: { id: "r1" } });

    expect(sent).toEqual([
      {
        rid: expect.any(String),
        source: "shop",
        group: "orders",
        method: "get",
        transport: "http",
        mode: "proxy",
        variables: { id: "7" },
        headers: {},
        runtimeId: "app",
      },
    ]);
    const id = `pg_${sent[0]?.rid}`;
    expect(replayed.structuredContent).toEqual({
      id,
      replayed: "r1",
      call: "GET shop.orders.get",
      status: 200,
      durationMs: 18,
      answer: { id: "7", accessToken: "[redacted]" },
      headers: { "set-cookie": "[redacted]", "content-type": "application/json" },
    });
    expect(stamped).toEqual([
      [id, { tool: "replay", access: "read", client: "editor 1" }],
      [id, "forgotten"],
    ]);
  });

  it("refuses to send a write without asking, and what cannot be sent again at all", async () => {
    sent.length = 0;
    const client = await modern();

    const write = await client.callTool({ name: "replay", arguments: { id: "r2" } });
    const webhook = await client.callTool({ name: "replay", arguments: { id: "r4" } });
    const unknown = await client.callTool({ name: "replay", arguments: { id: "nope" } });

    expect(write).toMatchObject({ isError: true });
    expect(JSON.stringify(write.content)).toContain(
      "r2 is a write (POST shop.orders.cancel): sending it again does it again",
    );
    expect(JSON.stringify(webhook.content)).toContain("r4 is a webhook delivery");
    expect(JSON.stringify(unknown.content)).toContain("Studio has no request nope");
    expect(sent).toEqual([]);
  });

  it("sends a write again once a person confirms the call it is shown, secrets replaced", async () => {
    sent.length = 0;
    questions.length = 0;

    const confirmed = await (await modern("accept")).callTool({
      name: "replay_write",
      arguments: { id: "r2" },
    });

    expect(questions).toHaveLength(1);
    expect(questions[0]).toContain(
      'POST shop.orders.cancel again, as request r2 sent it, with {"id":"8","password":"[redacted]"}',
    );
    expect(questions[0]).not.toContain("hunter2");
    expect(confirmed.isError).toBe(false);
    expect(sent).toMatchObject([{ method: "cancel", variables: { id: "8", password: "hunter2" } }]);
  });

  it("does not send a write the person declines, nor one for a client that cannot ask", async () => {
    sent.length = 0;

    const declined = await (await modern("decline")).callTool({
      name: "replay_write",
      arguments: { id: "r2" },
    });
    const unasked = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${TOKEN}`,
        "mcp-protocol-version": "2025-11-25",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "replay_write", arguments: { id: "r2" } },
      }),
    });

    expect(JSON.stringify(declined.content)).toContain("Not run: the person declined replay_write");
    expect(JSON.stringify(await unasked.json())).toContain(
      "or send it again from Studio's inspector, with its Replay button.",
    );
    expect(sent).toEqual([]);
  });

  it("refuses a read as a write before anyone is asked, and sends cut variables whole", async () => {
    sent.length = 0;
    questions.length = 0;
    const client = await modern("accept");

    const read = await client.callTool({ name: "replay_write", arguments: { id: "r1" } });
    const whole = await client.callTool({ name: "replay_write", arguments: { id: "r3" } });

    expect(JSON.stringify(read.content)).toContain("r1 is a read (GET shop.orders.get)");
    expect(questions).toHaveLength(1);
    expect(whole.isError).toBe(false);
    expect(sent).toMatchObject([{ method: "import", variables: { lines: "all of them" } }]);
  });
});

/* A client on the 2025 handshake through `courier-studio mcp`; one given an answer can ask its person, and answers so. */
async function bridged(answer?: "accept" | "decline") {
  const toBridge = new PassThrough();
  const fromBridge = new PassThrough();
  const done = bridgeToStudio({
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
  const client = new LegacyClient(
    { name: "editor", version: "1" },
    { capabilities: answer ? { elicitation: {} } : {} },
  );
  if (answer) {
    client.setRequestHandler(ElicitRequestSchema, async (request) => {
      questions.push(request.params.message);
      return { action: answer, content: {} };
    });
  }
  await client.connect(transport as never);
  return {
    client,
    close: async () => {
      await client.close();
      await done;
    },
  };
}

describe("courier-studio mcp", () => {
  it("carries a stdio client on the 2025 handshake to Studio, with the token it read", async () => {
    const { client, close } = await bridged();

    const failed = await client.callTool({ name: "requests", arguments: { failed: true } });
    await close();

    expect(JSON.stringify(failed.content)).toContain("Order 8 has shipped");
  });

  it("asks the client's person to confirm a write, and sends it again only once they do", async () => {
    sent.length = 0;
    stamped.length = 0;
    questions.length = 0;

    const accepting = await bridged("accept");
    const confirmed = await accepting.client.callTool({
      name: "replay_write",
      arguments: { id: "r2" },
    });
    await accepting.close();
    const declining = await bridged("decline");
    const declined = await declining.client.callTool({
      name: "replay_write",
      arguments: { id: "r2" },
    });
    await declining.close();

    expect(questions).toHaveLength(2);
    expect(questions[0]).toContain("POST shop.orders.cancel again, as request r2 sent it");
    expect(confirmed.isError).toBe(false);
    expect(confirmed).not.toHaveProperty("resultType");
    expect(confirmed.structuredContent).toMatchObject({ replayed: "r2", status: 200 });
    expect(declined.isError).toBe(true);
    expect(JSON.stringify(declined.content)).toContain("Not run: the person declined replay_write");
    expect(sent).toHaveLength(1);
    expect(stamped[0]).toEqual([
      expect.any(String),
      {
        tool: "replay_write",
        access: "destructive",
        client: "editor 1",
      },
    ]);
  });

  it("tells a client that cannot ask its person how else the write is sent", async () => {
    sent.length = 0;
    const { client, close } = await bridged();

    const unasked = await client.callTool({ name: "replay_write", arguments: { id: "r2" } });
    await close();

    expect(unasked.isError).toBe(true);
    expect(JSON.stringify(unasked.content)).toContain("send it again from Studio's inspector");
    expect(sent).toEqual([]);
  });

  it("tells the client its token was refused, rather than leaving it waiting", async () => {
    const input = new PassThrough();
    const lines: string[] = [];
    const bridged = bridgeToStudio({
      input,
      write: (line) => lines.push(line),
      url,
      token: "another project's token",
    });
    input.end(`${JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list", params: {} })}\n`);
    await bridged;

    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      id: 7,
      error: { code: -32603, message: expect.stringContaining("did not take the token") },
    });
  });

  it("tells the client no Studio answers where it was pointed, rather than handing it a page", async () => {
    const page = createServer((_request, response) => {
      response
        .writeHead(404, { "content-type": "text/html" })
        .end("<!doctype html><p>Not here</p>");
    });
    await new Promise<void>((resolve) => page.listen(0, "127.0.0.1", resolve));
    const input = new PassThrough();
    const lines: string[] = [];
    const bridged = bridgeToStudio({
      input,
      write: (line) => lines.push(line),
      url: `http://127.0.0.1:${(page.address() as AddressInfo).port}/mcp`,
      token: TOKEN,
    });
    input.end(
      [
        JSON.stringify({ jsonrpc: "2.0", id: "a", method: "tools/list", params: {} }),
        JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
        "",
      ].join("\n"),
    );
    await bridged;
    await new Promise<void>((resolve) => page.close(() => resolve()));

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      id: "a",
      error: { message: expect.stringContaining("No Studio answered at") },
    });
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
      error: { code: -32603, message: expect.stringContaining("npx @noverax/courier-studio") },
    });
  });
});

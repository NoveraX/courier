/**
 * What the MCP endpoint answers to requests no well-behaved client sends:
 * a caller it does not know, a page on another origin, a body that is not
 * JSON, headers that contradict the body, a revision it does not speak, a
 * confirmation it never gave.
 */
import { describe, expect, it } from "vitest";

import { createMcpHandler } from "../src";
import { META } from "../src/protocol/versions";
import { shopApi } from "./support/shop";

const URL_ = "http://127.0.0.1:3000/mcp";
const mcp = createMcpHandler({
  sources: { shop: shopApi("http://127.0.0.1:9") },
  authorize: (request) =>
    request.headers.get("authorization") === "Bearer key" ? { id: "agent" } : null,
  allow: (tool) => tool.name !== "orders_create",
});

function modern(method: string, params: Record<string, unknown> = {}, version = "2026-07-28") {
  return {
    jsonrpc: "2.0",
    id: 1,
    method,
    params: {
      ...params,
      _meta: { [META.protocolVersion]: version, [META.clientCapabilities]: {} },
    },
  };
}

function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const message = body as { method?: string; params?: { name?: string } };
  return mcp.handle(
    new Request(URL_, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer key",
        "mcp-protocol-version": "2026-07-28",
        ...(message.method && { "mcp-method": message.method }),
        ...(message.params?.name && { "mcp-name": message.params.name }),
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("who may call", () => {
  it("turns away a caller authorize does not know, and a page on another origin", async () => {
    const unknown = await post(modern("tools/list"), { authorization: "Bearer nope" });
    const foreign = await post(modern("tools/list"), { origin: "https://evil.example" });

    expect(unknown.status).toBe(401);
    expect(unknown.headers.get("www-authenticate")).toBe("Bearer");
    expect(foreign.status).toBe(403);
    expect((await post(modern("tools/list"))).status).toBe(200);
  });

  it("answers as authorize answers, when it answers with a response of its own", async () => {
    const challenge = new Response(null, {
      status: 401,
      headers: { "www-authenticate": 'Bearer resource_metadata="x"' },
    });
    const handler = createMcpHandler({
      sources: { shop: shopApi("http://127.0.0.1:9") },
      authorize: () => challenge,
    });

    const response = await handler.handle(
      new Request(URL_, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );

    expect(response).toBe(challenge);
  });

  it("is refused at its creation without authorize", () => {
    expect(() => createMcpHandler({ sources: {} } as never)).toThrow(
      expect.objectContaining({ code: "AGENT_HANDLER_INVALID" }),
    );
    expect(() => createMcpHandler({ authorize: () => ({}), confirmSecret: "short" })).toThrow(
      /32 characters/,
    );
  });
});

describe("what a request must be", () => {
  it("takes POST alone, a JSON body, and a client that reads JSON", async () => {
    const get = await mcp.handle(new Request(URL_, { headers: { authorization: "Bearer key" } }));
    const text = await post(modern("tools/list"), { "content-type": "text/plain" });
    const html = await post(modern("tools/list"), { accept: "text/html" });
    const broken = await post("{not json");

    expect([get.status, get.headers.get("allow")]).toEqual([405, "POST, OPTIONS"]);
    expect(text.status).toBe(415);
    expect(html.status).toBe(406);
    expect(broken.status).toBe(400);
    expect(await broken.json()).toMatchObject({ id: null, error: { code: -32700 } });
  });

  it("refuses a 2026-07-28 request whose headers contradict its body", async () => {
    const version = await post(modern("tools/list"), { "mcp-protocol-version": "2025-06-18" });
    const method = await post(modern("tools/list"), { "mcp-method": "tools/call" });
    const name = await post(modern("tools/call", { name: "orders_get", arguments: { id: "7" } }), {
      "mcp-name": "orders_cancel",
    });

    for (const response of [version, method, name]) {
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: -32020 } });
    }
  });

  it("names the revisions it speaks to a request under another, and tells a modern server's errors by status", async () => {
    const future = await post(modern("tools/list", {}, "2099-01-01"), {
      "mcp-protocol-version": "2099-01-01",
    });
    const unknownMethod = await post(modern("resources/list"));
    const noCapabilities = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: { _meta: { [META.protocolVersion]: "2026-07-28" } },
    });

    expect(future.status).toBe(400);
    expect(await future.json()).toMatchObject({
      error: { code: -32022, data: { supported: ["2026-07-28"], requested: "2099-01-01" } },
    });
    expect(unknownMethod.status).toBe(404);
    expect(noCapabilities.status).toBe(400);
    expect(await noCapabilities.json()).toMatchObject({ error: { code: -32602 } });
  });

  it("accepts a notification with 202, and keeps no session for a client on the 2025 handshake", async () => {
    const notification = await post(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { "mcp-protocol-version": "2025-11-25" },
    );
    const initialize = await post(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "x", version: "1" },
        },
      },
      { "mcp-protocol-version": "2025-11-25" },
    );

    expect(notification.status).toBe(202);
    expect(initialize.status).toBe(200);
    expect(initialize.headers.get("mcp-session-id")).toBeNull();
    expect(await initialize.json()).toMatchObject({
      result: { protocolVersion: "2025-11-25", capabilities: { tools: {} } },
    });
  });
});

describe("what a caller is told", () => {
  it("lists only the tools allow lets it see, privately cached, and knows no other", async () => {
    const list = await post(modern("tools/list"));
    const hidden = await post(
      modern("tools/call", { name: "orders_create", arguments: { total: 1 } }),
    );

    const { result } = (await list.json()) as {
      result: { tools: { name: string }[]; cacheScope: string; ttlMs: number };
    };
    expect(result.tools.map((tool) => tool.name)).toEqual([
      "orders_get",
      "orders_list",
      "orders_cancel",
    ]);
    expect([result.cacheScope, result.ttlMs]).toEqual(["private", 60_000]);
    expect(await hidden.json()).toMatchObject({
      error: { code: -32602, message: "Unknown tool: orders_create" },
    });
  });

  it("refuses a confirmation it never gave, before anything runs", async () => {
    const forged = await post(
      modern("tools/call", {
        name: "orders_cancel",
        arguments: { id: "7" },
        requestState: "v1.e30.AAAA",
        inputResponses: { confirm: { action: "accept", content: {} } },
      }),
    );

    expect(forged.status).toBe(400);
    expect(await forged.json()).toMatchObject({
      error: { code: -32602, message: expect.stringContaining("requestState") },
    });
  });
});

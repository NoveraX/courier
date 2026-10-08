/**
 * The stdio server against the official MCP clients: the 2026-07-28 client,
 * the same client on its default 2025 handshake, and the previous SDK
 * generation. Each lists the tools, calls them, and meets a destructive one
 * that a person must confirm — and the shop's API is asked, every time,
 * whether the call reached it.
 */
import { Client as ModernClient } from "@modelcontextprotocol/client";
import { Client as LegacyClient } from "@modelcontextprotocol/sdk/client/index.js";
import { studioHooks } from "@noverax/courier/internal";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createMcpServer } from "../src/protocol/mcp-server";
import { requestStates } from "../src/protocol/request-state";
import { runTool } from "../src/tools/run-tool";
import { toolSource } from "../src/tools/tool-source";
import { type ShopUpstream, seenByMiddleware, shopApi, startShopUpstream } from "./support/shop";
import { type StdioPair, stdioPair } from "./support/stdio-pair";

let upstream: ShopUpstream;
let pair: StdioPair | undefined;

beforeAll(async () => {
  upstream = await startShopUpstream();
});
afterAll(() => upstream.close());
afterEach(async () => {
  upstream.received.length = 0;
  seenByMiddleware.length = 0;
  await pair?.transport.close();
  await pair?.served;
  pair = undefined;
});

function serve(allowDestructive = false) {
  const sources = { shop: shopApi(upstream.baseURL) };
  const tools = toolSource(sources, {});
  pair = stdioPair(
    createMcpServer({
      info: { name: "courier", version: "test" },
      catalog: tools.catalog,
      run: (tool, args, caller) => runTool(tool, args, { ...caller, sources, timeoutMs: 5_000 }),
      allowDestructive,
      states: requestStates(new Uint8Array(32).fill(7)),
      maxResultChars: 100_000,
      transport: "stdio",
    }),
  );
  return pair.transport;
}

type Answer = "accept" | "decline";

async function modern(answer?: Answer) {
  const client = new ModernClient(
    { name: "modern-client", version: "2.3.1" },
    {
      versionNegotiation: { mode: { pin: "2026-07-28" } },
      ...(answer && { capabilities: { elicitation: { form: {} } } }),
    },
  );
  if (answer)
    client.setRequestHandler("elicitation/create", async () => ({ action: answer, content: {} }));
  await client.connect(serve() as never);
  return client;
}

async function legacy(answer?: Answer, allowDestructive = false) {
  const client = new LegacyClient(
    { name: "legacy-client", version: "1.32.1" },
    { capabilities: answer ? { elicitation: {} } : {} },
  );
  if (answer) {
    const { ElicitRequestSchema } = await import("@modelcontextprotocol/sdk/types.js");
    client.setRequestHandler(ElicitRequestSchema, async () => ({ action: answer, content: {} }));
  }
  await client.connect(serve(allowDestructive) as never);
  return client;
}

describe.each([
  ["2026-07-28 (SDK 2)", () => modern()],
  ["2025-11-25 (SDK 1)", () => legacy()],
])("a client speaking %s", (_era, connect) => {
  it("sees the endpoints marked .agent() alone, with what each takes, answers and does", async () => {
    const client = await connect();

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual([
      "orders_get",
      "orders_list",
      "orders_create",
      "orders_cancel",
    ]);
    const get = tools.find((tool) => tool.name === "orders_get");
    expect(get).toMatchObject({
      title: "Order",
      description: "One order by its id, with its status and total",
      inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      outputSchema: { type: "object", properties: { total: { type: "number" } } },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    });
    expect(tools.find((tool) => tool.name === "orders_cancel")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });

  it("calls an endpoint through its middleware, and reads its answer as text and as data", async () => {
    const client = await connect();

    const result = await client.callTool({ name: "orders_get", arguments: { id: "7" } });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toEqual({ id: "7", status: "open", total: 42 });
    expect(result.content).toEqual([
      { type: "text", text: '{"id":"7","status":"open","total":42}' },
    ]);
    expect(upstream.received).toEqual(["GET /orders/7"]);
    expect(seenByMiddleware[0]?.agent).toMatchObject({
      tool: "orders_get",
      access: "read",
      client: { name: expect.stringMatching(/client$/) },
    });
  });

  it("tells the model what was wrong with its arguments, and what the API answered", async () => {
    const client = await connect();

    const wrong = await client.callTool({ name: "orders_create", arguments: { total: -5 } });
    const broken = await client.callTool({ name: "orders_get", arguments: { id: "broken" } });

    expect(wrong.isError).toBe(true);
    expect(JSON.stringify(wrong.content)).toContain(
      "The arguments do not match what the tool takes",
    );
    expect(JSON.stringify(wrong.content)).toContain("- total:");
    expect(upstream.received).toEqual(["GET /orders/broken"]);
    expect(broken.isError).toBe(true);
    expect(JSON.stringify(broken.content)).toContain("The call failed with status 500");
    expect(JSON.stringify(broken.content)).toContain("The database is down");
  });

  it("knows no tool the definitions keep from agents", async () => {
    const client = await connect();

    await expect(client.callTool({ name: "orders_report", arguments: {} })).rejects.toThrow(
      /Unknown tool/,
    );
    expect(upstream.received).toEqual([]);
  });
});

describe("what Studio is told", () => {
  afterEach(() => {
    studioHooks.onRequestStart = undefined;
    studioHooks.onRequestError = undefined;
  });

  it("shows an agent's call with its tool, and a call that never ran as a refusal rather than a gap", async () => {
    const started = vi.fn();
    const failed = vi.fn();
    studioHooks.onRequestStart = started;
    studioHooks.onRequestError = failed;
    const client = await legacy("decline");

    await client.callTool({ name: "orders_get", arguments: { id: "7" } });
    await client.callTool({ name: "orders_cancel", arguments: { id: "7" } });
    await client.callTool({ name: "orders_cancel", arguments: {} });

    expect(
      started.mock.calls.map(([event]) => [event.method, event.agent?.tool, event.agent?.client]),
    ).toEqual([
      ["get", "orders_get", "legacy-client 1.32.1"],
      ["cancel", "orders_cancel", "legacy-client 1.32.1"],
      ["cancel", "orders_cancel", "legacy-client 1.32.1"],
    ]);
    expect(failed.mock.calls.map(([event]) => event.error.type)).toEqual(["aborted", "validation"]);
    expect(failed.mock.calls[0]?.[0].error.message).toBe(
      "Not run: the person declined orders_cancel.",
    );
    expect(upstream.received).toEqual(["GET /orders/7"]);
  });
});

describe("the two eras", () => {
  it("serves 2026-07-28 with no handshake, and the 2025 revisions after initialize", async () => {
    await (await modern()).listTools();
    const modernSent = (pair?.sent ?? []).map((message) => (message as { method?: string }).method);
    await pair?.transport.close();
    await (await legacy()).listTools();
    const legacySent = (pair?.sent ?? []).map((message) => (message as { method?: string }).method);

    expect(modernSent).not.toContain("initialize");
    expect(modernSent).toContain("tools/list");
    expect(legacySent.slice(0, 2)).toEqual(["initialize", "notifications/initialized"]);
  });
});

describe("a destructive tool", () => {
  it("runs once a person confirmed it, under 2026-07-28 and under the 2025 handshake", async () => {
    const questions: string[] = [];
    for (const connect of [() => modern("accept"), () => legacy("accept")]) {
      const client = await connect();
      const result = await client.callTool({ name: "orders_cancel", arguments: { id: "7" } });
      expect(result.isError).toBe(false);
      questions.push(
        (pair?.written ?? []).find((line) => line.includes("elicitation/create")) ?? "",
      );
      await pair?.transport.close();
    }
    expect(upstream.received).toEqual(["DELETE /orders/7", "DELETE /orders/7"]);
    /* 2026-07-28 asks inside the result and the call comes again; the 2025 handshake asks as a request of its own. */
    expect(questions[0]).toContain('"resultType":"input_required"');
    expect(questions[1]).toContain('"method":"elicitation/create"');
    expect(questions[1]).not.toContain("input_required");
    expect(questions.join("")).toContain('DELETE shop.orders.cancel with {\\"id\\":\\"7\\"}');
  });

  it("asks no one to confirm a call its arguments could not make", async () => {
    for (const connect of [() => modern("accept"), () => legacy("accept")]) {
      const client = await connect();
      const result = await client.callTool({ name: "orders_cancel", arguments: {} });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain(
        "The arguments do not match what the tool takes",
      );
      expect((pair?.written ?? []).some((line) => line.includes("elicitation/create"))).toBe(false);
      await pair?.transport.close();
    }
    expect(upstream.received).toEqual([]);
  });

  it("does not run when the person declines", async () => {
    for (const connect of [() => modern("decline"), () => legacy("decline")]) {
      const client = await connect();
      const result = await client.callTool({ name: "orders_cancel", arguments: { id: "7" } });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain(
        "Not run: the person declined orders_cancel",
      );
      await pair?.transport.close();
    }
    expect(upstream.received).toEqual([]);
  });

  it("does not run for a client that cannot ask a person, unless the operator lets the client decide", async () => {
    const modernClient = await modern();
    await expect(
      modernClient.callTool({ name: "orders_cancel", arguments: { id: "7" } }),
    ).rejects.toThrow(/elicitation/);
    await pair?.transport.close();

    const legacyClient = await legacy();
    const refused = await legacyClient.callTool({ name: "orders_cancel", arguments: { id: "7" } });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain("--allow-destructive");
    expect(upstream.received).toEqual([]);
    await pair?.transport.close();

    const allowed = await legacy(undefined, true);
    expect(
      (await allowed.callTool({ name: "orders_cancel", arguments: { id: "7" } })).isError,
    ).toBe(false);
    expect(upstream.received).toEqual(["DELETE /orders/7"]);
  });
});

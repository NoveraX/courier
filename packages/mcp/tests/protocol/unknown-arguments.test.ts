/**
 * A call that names an argument its tool does not take, where the tool's
 * input schema names every argument it takes: refused before anything
 * runs, with the names the tool does not take and those it does, as a
 * result the model corrects its call from, and told to whoever records the
 * tool's refusals. A schema that lets other names through leaves them to
 * the tool.
 */
import { describe, expect, it, vi } from "vitest";

import type { Connection } from "../../src/protocol/connection";
import { createMcpServer } from "../../src/protocol/mcp-server";
import { requestStates } from "../../src/protocol/request-state";
import { type ServedTool, toolSet } from "../../src/protocol/served-tool";

const ORDERS_LIST = {
  type: "object",
  properties: {
    status: { type: "string" },
    limit: { type: "integer" },
    offset: { type: "integer" },
  },
  additionalProperties: false,
};

function served(inputSchema: Record<string, unknown>) {
  const run = vi.fn(async (args: Record<string, unknown>) => ({ ok: true as const, data: args }));
  const refused = vi.fn();
  const tool: ServedTool = {
    name: "orders_list",
    description: "The shop's orders",
    access: "read",
    inputSchema,
    idempotent: true,
    action: "GET shop.orders.list",
    run,
    refused,
  };
  const server = createMcpServer({
    info: { name: "shop", version: "1.0.0" },
    tools: () => toolSet([tool]),
    allowDestructive: false,
    states: requestStates(new Uint8Array(32).fill(7)),
    maxResultChars: 100_000,
    transport: "stdio",
  });
  return { server, run, refused };
}

async function call(
  { server }: ReturnType<typeof served>,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const connection: Connection = { transport: "stdio", listening: new Map() };
  const signal = new AbortController().signal;
  const params = {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0.0" },
  };
  await server.request({ jsonrpc: "2.0", id: 1, method: "initialize", params }, connection, signal);
  const answer = await server.request(
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "orders_list", arguments: args },
    },
    connection,
    signal,
  );
  if (answer === undefined || !("result" in answer))
    throw new Error(`No result: ${JSON.stringify(answer)}`);
  return answer.result as Record<string, unknown>;
}

describe("a call naming an argument its tool does not take", () => {
  it.each([
    [
      { status: "open", sort: "total" },
      '"sort" is not an argument of orders_list, which takes "status", "limit" and "offset"',
    ],
    [
      { sort: "total", "": 1, limit: 5 },
      '"sort" and "" are not arguments of orders_list, which takes "status", "limit" and "offset"',
    ],
  ])("is refused before it runs, with what the tool takes: %j", async (args, message) => {
    const tool = served(ORDERS_LIST);

    const result = await call(tool, args);

    expect(result).toMatchObject({ isError: true, content: [{ type: "text", text: message }] });
    expect(tool.run).not.toHaveBeenCalled();
    expect(tool.refused).toHaveBeenCalledWith(args, expect.anything(), {
      kind: "validation",
      message,
    });
  });

  it("is refused by a tool that takes none, saying so", async () => {
    const tool = served({ type: "object", additionalProperties: false });

    const result = await call(tool, { status: "open" });

    expect(result.content).toEqual([
      { type: "text", text: '"status" is not an argument of orders_list, which takes none' },
    ]);
  });

  it.each([
    ["lets other names through", { type: "object", properties: { status: { type: "string" } } }],
    [
      "names them by a pattern",
      { ...ORDERS_LIST, patternProperties: { "^x-": { type: "string" } } },
    ],
  ])("runs where the tool's schema %s, leaving them to the tool", async (_, schema) => {
    const tool = served(schema);

    const result = await call(tool, { status: "open", "x-trace": "t1" });

    expect(result.isError).toBe(false);
    expect(tool.run).toHaveBeenCalledWith({ status: "open", "x-trace": "t1" }, expect.anything());
  });
});

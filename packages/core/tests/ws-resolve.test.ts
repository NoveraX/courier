import { describe, expect, it, vi } from "vitest";
import type { WSSocketContext } from "../src/adapter/ws-context";
import { parseTopic, resolveSubscribeTopic } from "../src/adapter/ws-resolve";
import type { WSMessage } from "../src/realtime/ws/ws-protocol";
import { ENDPOINT_SCHEMA } from "../src/validation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockCtx(sources: Record<string, unknown> = {}): {
  ctx: WSSocketContext;
  sent: WSMessage[];
} {
  const sent: WSMessage[] = [];
  const ctx = {
    sources,
    sendMessage: (msg: WSMessage) => sent.push(msg),
  } as unknown as WSSocketContext;
  return { ctx, sent };
}

function createEndpoint(transport: string, receive?: unknown): unknown {
  const fn = vi.fn();
  const schema = { transport, ...(receive ? { receive } : {}) };
  return {
    [ENDPOINT_SCHEMA]: schema,
    kind: "channel",
    method: "get",
    path: "",
    probe: fn,
    served: true,
    options: { middleware: [], allowedHeaders: [], meta: {}, tags: [], inherit: true },
  };
}

function createSource(group: string, method: string, endpoint: unknown): unknown {
  return {
    options: {
      groups: {
        [group]: {
          endpoints: { [method]: endpoint },
          options: {},
          [method]: endpoint,
        },
      },
    },
    [group]: { [method]: endpoint },
    [method]: endpoint,
  };
}

// ---------------------------------------------------------------------------
// parseTopic
// ---------------------------------------------------------------------------

describe("parseTopic", () => {
  it("parses source.group.method format", () => {
    expect(parseTopic("api.users.getAll")).toEqual({
      source: "api",
      group: "users",
      method: "getAll",
    });
  });

  it("parses source.method format (no group)", () => {
    expect(parseTopic("api.getAll")).toEqual({
      source: "api",
      group: undefined,
      method: "getAll",
    });
  });

  it("parses bare method name", () => {
    expect(parseTopic("getAll")).toEqual({
      source: undefined,
      group: undefined,
      method: "getAll",
    });
  });

  it("handles empty string gracefully", () => {
    const result = parseTopic("");
    expect(result.method).toBe("");
  });

  it("reads a four-segment topic as an endpoint of a group inside a group", () => {
    const result = parseTopic("a.b.c.d");
    expect(result).toEqual({ source: "a", group: "b.c", method: "d" });
  });
});

// ---------------------------------------------------------------------------
// resolveSubscribeTopic
// ---------------------------------------------------------------------------

describe("resolveSubscribeTopic", () => {
  it("returns error when topic has no source", () => {
    const { ctx, sent } = createMockCtx();
    const msg: WSMessage = { type: "subscribe", id: "1", topic: "getAll" };

    const result = resolveSubscribeTopic(ctx, msg, "getAll");

    expect(result).toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.error?.code).toBe(4400);
    expect(sent[0]!.error?.message).toBe("Topic must include source name");
  });

  it("returns error when source is not found", () => {
    const { ctx, sent } = createMockCtx({});
    const msg: WSMessage = { type: "subscribe", id: "2", topic: "unknown.feed" };

    const result = resolveSubscribeTopic(ctx, msg, "unknown.feed");

    expect(result).toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.error?.code).toBe(4403);
    expect(sent[0]!.error?.message).toBe("Subscription rejected");
  });

  it("returns error when endpoint is not a WS transport", () => {
    const endpoint = createEndpoint("http");
    const source = createSource("chat", "feed", endpoint);
    const { ctx, sent } = createMockCtx({ api: source });
    const msg: WSMessage = { type: "subscribe", id: "3", topic: "api.chat.feed" };

    const result = resolveSubscribeTopic(ctx, msg, "api.chat.feed");

    expect(result).toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.error?.code).toBe(4403);
    expect(sent[0]!.error?.message).toBe("Subscription rejected");
  });

  it("resolves a valid WS endpoint with group", () => {
    const endpoint = createEndpoint("ws");
    const source = createSource("chat", "feed", endpoint);
    const { ctx, sent } = createMockCtx({ api: source });
    const msg: WSMessage = { type: "subscribe", id: "4", topic: "api.chat.feed" };

    const result = resolveSubscribeTopic(ctx, msg, "api.chat.feed");

    expect(result).toBeDefined();
    expect(result!.source).toBe("api");
    expect(result!.group).toBe("chat");
    expect(result!.method).toBe("feed");
    expect(result!.endpoint).toBe((endpoint as { probe: unknown }).probe);
    expect(sent).toHaveLength(0);
  });

  it("preserves message id in error responses", () => {
    const { ctx, sent } = createMockCtx({});
    const msg: WSMessage = { type: "subscribe", id: "msg-99", topic: "bad.topic" };

    resolveSubscribeTopic(ctx, msg, "bad.topic");

    expect(sent[0]!.id).toBe("msg-99");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { courier } from "../src/define/courier";
import type { ChannelHandlers, WSChannelContext } from "../src/realtime/types";
import type { StudioHooks } from "../src/studio/hooks";
import { ValidationError } from "../src/validation";
import { executeDirectWSChannel } from "../src/transport/in-process/ws-channel";
import { createPlaygroundWSRegistry } from "../src/transport/in-process/ws-registry";

const { query, channel } = courier();

const HOOKS_KEY = Symbol.for("courier.studio.hooks");
const hooks = (globalThis as Record<symbol, unknown>)[HOOKS_KEY] as StudioHooks;

function installHooks(overrides: Partial<StudioHooks>): () => void {
  Object.assign(hooks, overrides);
  return () => {
    for (const key of Object.keys(overrides)) {
      delete (hooks as Record<string, unknown>)[key];
    }
  };
}

function makeChannelSources(
  factory: (variables: any) => ChannelHandlers,
  opts: { variablesSchema?: z.ZodTypeAny; receiveSchema?: z.ZodTypeAny } = {},
) {
  const room = channel.variables(opts.variablesSchema).send(opts.receiveSchema).response<unknown>().implement(factory as never);
  return {
    api: {
      options: { groups: { chat: { options: {}, room } } },
      room,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("executeDirectWSChannel — resolution + validation", () => {
  it("throws when source is missing", async () => {
    const sources = makeChannelSources(() => ({ onMessage: vi.fn() }));
    await expect(
      executeDirectWSChannel(sources as any, { source: "missing", method: "room" }),
    ).rejects.toThrow(/failed to resolve/);
  });

  it("throws when endpoint is not WS transport", async () => {
    const httpEndpoint = query.response<string>().via((http) => http.get("/x"));
    const sources = { api: { options: { groups: {} }, health: httpEndpoint } };
    await expect(
      executeDirectWSChannel(sources as any, { source: "api", method: "health" }),
    ).rejects.toThrow(/failed to resolve/);
  });

  it("validates variables and rejects ValidationError", async () => {
    const sources = makeChannelSources(() => ({ onMessage: vi.fn() }), {
      variablesSchema: z.object({ roomId: z.string() }),
    });
    await expect(
      executeDirectWSChannel(sources as any, {
        source: "api",
        group: "chat",
        method: "room",
        variables: { roomId: 999 },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("executeDirectWSChannel — bidirectional flow", () => {
  it("client.send → handlers.onMessage receives the payload", async () => {
    let received: unknown;
    const sources = makeChannelSources(() => ({
      onMessage: (_ctx, msg) => {
        received = msg;
      },
    }));
    const channel = await executeDirectWSChannel(sources as any, {
      source: "api",
      group: "chat",
      method: "room",
    });
    await channel.send({ text: "hi" });
    expect(received).toEqual({ text: "hi" });
  });

  it("server channelCtx.send → client.on('data') receives", async () => {
    let serverCtx: WSChannelContext | undefined;
    const sources = makeChannelSources(() => ({
      onJoin: (ctx) => {
        serverCtx = ctx;
      },
      onMessage: vi.fn(),
    }));
    const channel = await executeDirectWSChannel(sources as any, {
      source: "api",
      group: "chat",
      method: "room",
    });
    const received: unknown[] = [];
    channel.on("data", (d) => received.push(d));
    serverCtx!.send({ from: "server" });
    expect(received).toEqual([{ from: "server" }]);
  });

  it("validates client→server messages against receive schema", async () => {
    const sources = makeChannelSources(() => ({ onMessage: vi.fn() }), {
      receiveSchema: z.object({ text: z.string() }),
    });
    const channel = await executeDirectWSChannel(sources as any, {
      source: "api",
      group: "chat",
      method: "room",
    });
    await expect(channel.send({ text: 99 })).rejects.toBeInstanceOf(ValidationError);
  });

  it("transitions status connecting→connected→disconnected", async () => {
    const sources = makeChannelSources(() => ({ onMessage: vi.fn() }));
    const channel = await executeDirectWSChannel(sources as any, {
      source: "api",
      group: "chat",
      method: "room",
    });
    expect(channel.status).toBe("connected");
    const seen: string[] = [];
    channel.on("status", (s) => seen.push(s));
    expect(seen).toEqual(["connected"]); // late subscriber gets current
    channel.close();
    await new Promise((r) => setTimeout(r, 0));
    expect(channel.status).toBe("disconnected");
    expect(seen).toContain("disconnected");
  });

  it("calls onLeave on close", async () => {
    const onLeave = vi.fn();
    const sources = makeChannelSources(() => ({ onMessage: vi.fn(), onLeave }));
    const channel = await executeDirectWSChannel(sources as any, {
      source: "api",
      group: "chat",
      method: "room",
    });
    channel.close();
    await new Promise((r) => setTimeout(r, 0));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it("onLeave throwing does NOT block status transition to disconnected", async () => {
    const onLeave = vi.fn(() => {
      throw new Error("onLeave exploded");
    });
    const sources = makeChannelSources(() => ({ onMessage: vi.fn(), onLeave }));
    const channel = await executeDirectWSChannel(sources as any, {
      source: "api",
      group: "chat",
      method: "room",
    });
    expect(channel.status).toBe("connected");
    channel.close();
    await new Promise((r) => setTimeout(r, 0));
    expect(onLeave).toHaveBeenCalledOnce();
    // Even though onLeave threw, status must reach "disconnected" so the
    // client wrapper can finish its lifecycle. This is the contract that
    // protects against handler bugs blocking cleanup.
    expect(channel.status).toBe("disconnected");
  });
});

describe("executeDirectWSChannel — broadcast", () => {
  it("broadcast from one channel reaches a peer subscribed to the same topic, excluding sender", async () => {
    const registry = createPlaygroundWSRegistry();
    let serverCtxA: WSChannelContext | undefined;
    const sources = makeChannelSources(() => ({
      onJoin: (ctx) => {
        if (!serverCtxA) serverCtxA = ctx;
      },
      onMessage: vi.fn(),
    }));

    const a = await executeDirectWSChannel(
      sources as any,
      { source: "api", group: "chat", method: "room" },
      { registry },
    );
    const b = await executeDirectWSChannel(
      sources as any,
      { source: "api", group: "chat", method: "room" },
      { registry },
    );

    const aReceived: unknown[] = [];
    const bReceived: unknown[] = [];
    a.on("data", (d) => aReceived.push(d));
    b.on("data", (d) => bReceived.push(d));

    // Server side of channel A broadcasts to the same topic.
    serverCtxA!.broadcast(serverCtxA!.topic, { hello: "world" });

    // Sender (A) is excluded; B receives.
    expect(aReceived).toEqual([]);
    expect(bReceived).toEqual([{ hello: "world" }]);
  });

  it("isolated registries do not leak across instances", async () => {
    const r1 = createPlaygroundWSRegistry();
    const r2 = createPlaygroundWSRegistry();
    let ctx1: WSChannelContext | undefined;
    const sources = makeChannelSources(() => ({
      onJoin: (ctx) => {
        if (!ctx1) ctx1 = ctx;
      },
      onMessage: vi.fn(),
    }));

    await executeDirectWSChannel(
      sources as any,
      { source: "api", group: "chat", method: "room" },
      { registry: r1 },
    );
    const b = await executeDirectWSChannel(
      sources as any,
      { source: "api", group: "chat", method: "room" },
      { registry: r2 },
    );

    const bSeen: unknown[] = [];
    b.on("data", (d) => bSeen.push(d));
    ctx1!.broadcast(ctx1!.topic, { x: 1 });
    expect(bSeen).toEqual([]);
  });
});

describe("executeDirectWSChannel — studio instrumentation", () => {
  it("emits onStreamOpen with transport=ws,mode=direct exactly once", async () => {
    const onStreamOpen = vi.fn();
    const onStreamClose = vi.fn();
    const cleanup = installHooks({ onStreamOpen, onStreamClose });

    const sources = makeChannelSources(() => ({ onMessage: vi.fn() }));
    const channel = await executeDirectWSChannel(sources as any, {
      source: "api",
      group: "chat",
      method: "room",
    });
    channel.close();
    await new Promise((r) => setTimeout(r, 0));

    expect(onStreamOpen).toHaveBeenCalledOnce();
    expect(onStreamOpen.mock.calls[0]![0]).toMatchObject({ transport: "ws", mode: "direct" });
    expect(onStreamClose).toHaveBeenCalledOnce();
    cleanup();
  });
});

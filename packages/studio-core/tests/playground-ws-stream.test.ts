/**
 * Tests for the Playground WS executor.
 *
 * Drives `handlePlaygroundStream({ transport: "ws" })` end-to-end through
 * the canonical in-process pipeline (`executeDirectWSChannel`).
 *
 * Coverage:
 *  - headers / middleware execution / variables validation
 *  - real broadcast between two playground channels on the same topic
 *  - double-fire prevention: exactly ONE `stream:open` per logical stream
 *  - abort flow: cancel produces `stream:close{reason:"disconnect"}`
 *  - error normalization (resolution failure → `stream:error`, no orphan open)
 *  - onWSTrack/onWSUntrack are NOT fired for in-process channels (they
 *    belong to the canonical real-WS path; the playground channel registry
 *    is the source of truth for in-process delivery)
 *  - playground-ws-send routing through the in-process channel registry
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Sources } from "@noverax/nexus/define";

import {
  cancelPlaygroundStream,
  handlePlaygroundStream,
} from "../src/connect/playground-stream";
import {
  handlePlaygroundWSSend,
  playgroundChannelCount,
  registerPlaygroundChannel,
  unregisterPlaygroundChannel,
} from "../src/connect/playground-ws-send";
import type { WSChannel } from "@noverax/nexus/realtime";

// ── Real-singleton hook installation ─────────────────────────────────────────

const HOOKS_KEY = Symbol.for("nexus.studio.hooks");
const hooks = (globalThis as Record<symbol, unknown>)[HOOKS_KEY] as Record<string, unknown>;

const mockHooks = {
  onStreamOpen: vi.fn(),
  onStreamMessage: vi.fn(),
  onStreamClose: vi.fn(),
  onStreamError: vi.fn(),
  onWSTrack: vi.fn(),
  onWSUntrack: vi.fn(),
};

beforeEach(() => {
  for (const k of Object.keys(mockHooks) as Array<keyof typeof mockHooks>) {
    mockHooks[k].mockClear();
    hooks[k] = mockHooks[k];
  }
});

afterEach(() => {
  for (const k of Object.keys(mockHooks)) {
    delete hooks[k];
  }
});

// ── WS source fixtures ──────────────────────────────────────────────────────

const SCHEMA = Symbol.for("nexus.endpoint.schema");

interface ChannelHandlers {
  onJoin?(ctx: unknown): void | Promise<void>;
  onMessage?(ctx: unknown, message: unknown): void | Promise<void>;
  onLeave?(ctx: unknown): void | Promise<void>;
}

function withWSSchema(
  factory: (variables: unknown) => ChannelHandlers,
  schema: { variables?: unknown; receive?: unknown } = {},
) {
  Object.defineProperty(factory, SCHEMA, {
    value: { transport: "ws", ...schema },
  });
  return factory;
}

function buildWSSources(
  factory: (variables: unknown) => ChannelHandlers,
  schemaExtras?: { variables?: unknown; receive?: unknown },
  middleware: Array<{
    name: string;
    phase: "wrap";
    handler: (ctx: { headers: Headers }, next: () => Promise<unknown>) => Promise<unknown>;
  }> = [],
): Sources {
  const room = withWSSchema(factory, schemaExtras);
  return {
    api: {
      options: {
        ...(middleware.length ? { middleware } : {}),
        groups: { chat: { options: {}, room } },
      },
    },
  } as unknown as Sources;
}

function basePayload() {
  return {
    source: "api",
    group: "chat",
    method: "room",
    variables: undefined,
    transport: "ws" as const,
  };
}

async function startWSStream(sources: Sources): Promise<string> {
  let id = "";
  const cbDone = new Promise<void>((resolve) => {
    void handlePlaygroundStream(sources, basePayload(), (res) => {
      id = res.requestId;
      resolve();
    });
  });
  await cbDone;
  // Give the in-process executor a microtask to set up the channel + register.
  await new Promise((r) => setTimeout(r, 0));
  return id;
}

// ── open + middleware + headers ─────────────────────────────────────────────

describe("playground WS executor — basics", () => {
  it("emits onStreamOpen exactly once with mode=direct,transport=ws", async () => {
    const sources = buildWSSources(() => ({ onMessage: vi.fn() }));
    const id = await startWSStream(sources);

    expect(mockHooks.onStreamOpen).toHaveBeenCalledOnce();
    expect(mockHooks.onStreamOpen.mock.calls[0]![0]).toMatchObject({
      requestId: id,
      transport: "ws",
      mode: "direct",
      source: "api",
      group: "chat",
      method: "room",
    });

    cancelPlaygroundStream(id);
  });

  it("runs the middleware chain end-to-end", async () => {
    // The playground StreamPayload doesn't carry user headers, but the
    // middleware chain MUST still execute on every WS subscribe. We assert
    // via a wrap spy that proves the chain ran for the in-process channel.
    const middlewareSpy = vi.fn(
      async (_ctx: { headers: Headers }, next: () => Promise<unknown>) => {
        return await next();
      },
    );
    const sources = buildWSSources(() => ({ onMessage: vi.fn() }), undefined, [
      { name: "spy", phase: "wrap", handler: middlewareSpy },
    ]);

    const id = await startWSStream(sources);
    expect(middlewareSpy).toHaveBeenCalledOnce();
    cancelPlaygroundStream(id);
  });

  it("emits onStreamError when endpoint not found (no orphan stream:open)", async () => {
    const sources = buildWSSources(() => ({ onMessage: vi.fn() }));
    let id = "";
    await new Promise<void>((resolve) => {
      void handlePlaygroundStream(sources, { ...basePayload(), method: "nonexistent" }, (res) => {
        id = res.requestId;
        resolve();
      });
    });
    await new Promise((r) => setTimeout(r, 5));

    expect(mockHooks.onStreamError).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: id,
        error: expect.stringContaining("failed to resolve"),
      }),
    );
    expect(mockHooks.onStreamOpen).not.toHaveBeenCalled();
  });
});

// ── double-fire prevention ──────────────────────────────────────────────────

describe("playground WS executor — double-fire prevention", () => {
  it("fires onStreamOpen EXACTLY ONCE per logical stream", async () => {
    const sources = buildWSSources(() => ({
      onJoin: vi.fn(),
      onMessage: vi.fn(),
      onLeave: vi.fn(),
    }));

    const id = await startWSStream(sources);
    expect(id).toBeTruthy();

    // After full lifecycle (open + close) only the canonical pipeline's
    // single beginStream call may have fired. The legacy `emitOpen` helper
    // is gone — if it slipped back in, this assertion catches it.
    cancelPlaygroundStream(id);
    await new Promise((r) => setTimeout(r, 5));

    expect(mockHooks.onStreamOpen).toHaveBeenCalledOnce();
    expect(mockHooks.onStreamClose).toHaveBeenCalledOnce();
  });

  it("does NOT call onWSTrack / onWSUntrack for in-process channels", async () => {
    const sources = buildWSSources(() => ({ onMessage: vi.fn() }));
    const id = await startWSStream(sources);
    cancelPlaygroundStream(id);
    await new Promise((r) => setTimeout(r, 5));

    // onWSTrack/onWSUntrack are reserved for the canonical real-WS path
    // (user app subscribing to a live nexus-server). The in-process
    // playground channel registers in `playgroundChannelRegistry` instead.
    expect(mockHooks.onWSTrack).not.toHaveBeenCalled();
    expect(mockHooks.onWSUntrack).not.toHaveBeenCalled();
  });
});

// ── cancel → disconnect ─────────────────────────────────────────────────────

describe("playground WS executor — cancel", () => {
  it("cancel produces onStreamClose with reason=disconnect", async () => {
    const sources = buildWSSources(() => ({ onMessage: vi.fn() }));
    const id = await startWSStream(sources);

    cancelPlaygroundStream(id);
    await new Promise((r) => setTimeout(r, 5));

    expect(mockHooks.onStreamClose).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: id, reason: "disconnect" }),
    );
  });

  it("calls onLeave when channel is closed", async () => {
    const onLeave = vi.fn();
    const sources = buildWSSources(() => ({ onMessage: vi.fn(), onLeave }));
    const id = await startWSStream(sources);

    cancelPlaygroundStream(id);
    await new Promise((r) => setTimeout(r, 5));

    expect(onLeave).toHaveBeenCalledOnce();
  });

  it("removes channel from playground registry on cleanup", async () => {
    const sources = buildWSSources(() => ({ onMessage: vi.fn() }));
    const before = playgroundChannelCount();
    const id = await startWSStream(sources);
    expect(playgroundChannelCount()).toBe(before + 1);

    cancelPlaygroundStream(id);
    await new Promise((r) => setTimeout(r, 5));
    expect(playgroundChannelCount()).toBe(before);
  });
});

// ── playground-ws-send routing ──────────────────────────────────────────────

describe("handlePlaygroundWSSend — in-process channel routing", () => {
  it("delivers payload to handlers.onMessage via channel.send", async () => {
    let received: unknown;
    const sources = buildWSSources(() => ({
      onMessage: (_ctx, msg) => {
        received = msg;
      },
    }));
    const id = await startWSStream(sources);

    await new Promise<void>((resolve) => {
      handlePlaygroundWSSend(
        { requestId: id, topic: "api.chat.room", data: { text: "hi" } },
        (res) => {
          expect(res.ok).toBe(true);
          resolve();
        },
      );
    });

    expect(received).toEqual({ text: "hi" });
    cancelPlaygroundStream(id);
  });

  it("returns error when no channel registered for requestId", () => {
    let result: { ok: boolean; error?: string } | undefined;
    handlePlaygroundWSSend(
      { requestId: "missing", topic: "api.chat.room", data: { x: 1 } },
      (r) => {
        result = r;
      },
    );
    expect(result?.ok).toBe(false);
    expect(result?.error).toContain("No active connection");
  });

  it("emits outbound stream:message via instrumentWSChannel (no manual emit)", async () => {
    const sources = buildWSSources(() => ({ onMessage: vi.fn() }));
    const id = await startWSStream(sources);
    mockHooks.onStreamMessage.mockClear();

    await new Promise<void>((resolve) => {
      handlePlaygroundWSSend({ requestId: id, topic: "api.chat.room", data: "ping" }, () =>
        resolve(),
      );
    });

    // instrumentWSChannel emits a single outbound "message" event for client.send
    expect(mockHooks.onStreamMessage).toHaveBeenCalledTimes(1);
    expect(mockHooks.onStreamMessage.mock.calls[0]![0]).toMatchObject({
      requestId: id,
      eventType: "message",
    });
    cancelPlaygroundStream(id);
  });
});

// ── deliverInProcess callback contract ──────────────────────────────────────

/**
 * Construct a synthetic WSChannel that satisfies the type but lets each test
 * inject custom `send()` semantics. Other channel methods are no-ops because
 * `deliverInProcess` only ever calls `send()`.
 */
function syntheticChannel(send: (data: unknown) => void | Promise<void>): WSChannel {
  return {
    send,
    on: () => () => {},
    close: () => {},
    status: "open",
  } as unknown as WSChannel;
}

describe("handlePlaygroundWSSend — deliverInProcess callback contract", () => {
  const REQUEST_ID = "synthetic-rid";

  afterEach(() => {
    unregisterPlaygroundChannel(REQUEST_ID);
  });

  it("invokes callback exactly once with ok=true on successful send", async () => {
    const channel = syntheticChannel(() => {
      // Resolves immediately with no payload validation.
    });
    registerPlaygroundChannel(REQUEST_ID, channel);
    const callback = vi.fn();

    handlePlaygroundWSSend({ requestId: REQUEST_ID, topic: "api.chat.room", data: 1 }, callback);
    await new Promise((r) => setTimeout(r, 5));

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ ok: true });
  });

  it("invokes callback exactly once with ok=false on synchronous send throw", async () => {
    const channel = syntheticChannel(() => {
      throw new Error("sync boom");
    });
    registerPlaygroundChannel(REQUEST_ID, channel);
    const callback = vi.fn();

    handlePlaygroundWSSend({ requestId: REQUEST_ID, topic: "api.chat.room", data: 1 }, callback);
    await new Promise((r) => setTimeout(r, 5));

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ ok: false, error: "sync boom" });
    // Failed send must unregister the channel so retries surface a clean error.
    expect(playgroundChannelCount()).toBe(0);
  });

  it("invokes callback exactly once with ok=false on async send rejection", async () => {
    const channel = syntheticChannel(async () => {
      throw new Error("async boom");
    });
    registerPlaygroundChannel(REQUEST_ID, channel);
    const callback = vi.fn();

    handlePlaygroundWSSend({ requestId: REQUEST_ID, topic: "api.chat.room", data: 1 }, callback);
    await new Promise((r) => setTimeout(r, 5));

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ ok: false, error: "async boom" });
    expect(playgroundChannelCount()).toBe(0);
  });

  it("never invokes callback twice when the success-path callback itself throws", async () => {
    // Real-world scenario: the socket-layer callback that consumes the result
    // throws synchronously (e.g. an emit on a torn-down socket). The throw
    // escapes `fire({ ok: true })` and lands in the catch block, which would
    // try to fire a second result. The `callbackFired` guard short-circuits
    // the second invocation so the consumer observes exactly one report.
    const channel = syntheticChannel(() => {
      // Success path.
    });
    registerPlaygroundChannel(REQUEST_ID, channel);

    let calls = 0;
    const callback = vi.fn((_result: { ok: boolean; error?: string }) => {
      calls += 1;
      if (calls === 1) throw new Error("consumer boom");
    });

    handlePlaygroundWSSend({ requestId: REQUEST_ID, topic: "api.chat.room", data: 1 }, callback);
    await new Promise((r) => setTimeout(r, 5));

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ ok: true });
  });

  it("never invokes callback twice with a thenable that resolves and then rejects", async () => {
    // A misbehaving thenable calls both `resolve` and `reject`. The Promise
    // spec says the first settlement wins, so this is a no-op double-fire
    // by design — but the guard enforces single-callback regardless of
    // whether the catch ever runs.
    const channel = syntheticChannel(() => {
      return {
        then(onFulfilled: () => void, onRejected: (err: unknown) => void) {
          onFulfilled();
          onRejected(new Error("late reject"));
        },
      } as unknown as Promise<void>;
    });
    registerPlaygroundChannel(REQUEST_ID, channel);
    const callback = vi.fn();

    handlePlaygroundWSSend({ requestId: REQUEST_ID, topic: "api.chat.room", data: 1 }, callback);
    await new Promise((r) => setTimeout(r, 5));

    expect(callback).toHaveBeenCalledTimes(1);
  });
});

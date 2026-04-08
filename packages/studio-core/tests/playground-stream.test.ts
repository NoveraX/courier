import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Sources } from "@noverax/nexus/define";

import { executeSSEStream } from "../src/connect/playground-sse-executor";
import {
  activeStreamCount,
  cancelAllPlaygroundStreams,
  cancelPlaygroundStream,
  handlePlaygroundStream,
} from "../src/connect/playground-stream";

// ── Studio hooks installed on the real singleton ─────────────────────────────
//
// `executeDirectSSE` (called by the new SSE executor) lives inside the core
// package and reads `studioHooks` from `globalThis[Symbol.for("nexus.studio.hooks")]`.
// vi.mock cannot reach inside another package, so we install spies directly
// on the singleton — same pattern core's own tests use.

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

// ── Sources fixtures ─────────────────────────────────────────────────────────

const SCHEMA = Symbol.for("nexus.endpoint.schema");

/** Stamp a generator with the SSE transport schema */
function withSSESchema<T>(fn: T): T {
  Object.defineProperty(fn, SCHEMA, { value: { transport: "sse" } });
  return fn;
}

const fakeSSE = withSSESchema(async function* () {
  yield { data: { msg: "hello" } };
  yield { data: { msg: "world" }, event: "update" };
});

function buildSources(endpoint: unknown = fakeSSE): Sources {
  return {
    api: {
      options: {
        groups: {
          chat: { options: {}, stream: endpoint },
        },
      },
    },
  } as unknown as Sources;
}

function basePayload(
  overrides?: Partial<{ source: string; group: string; method: string; transport: "sse" | "ws" }>,
) {
  return {
    source: "api",
    group: "chat",
    method: "stream",
    variables: { text: "hi" },
    transport: "sse" as const,
    ...overrides,
  };
}

// ── handlePlaygroundStream ──────────────────────────────────────────────────

describe("handlePlaygroundStream", () => {
  it("returns error when no sources", async () => {
    const cb = vi.fn();
    await handlePlaygroundStream(undefined, basePayload(), cb);
    expect(cb).toHaveBeenCalledWith({ requestId: "", error: "No sources registered" });
  });

  it("returns requestId for valid SSE endpoint", async () => {
    const cb = vi.fn();
    await handlePlaygroundStream(buildSources(), basePayload(), cb);

    expect(cb).toHaveBeenCalledTimes(1);
    const result = cb.mock.calls[0]![0] as { requestId: string; error?: string };
    expect(result.requestId).toBeTruthy();
    expect(result.error).toBeUndefined();
  });

  it("cleans up activeStreams after completion", async () => {
    await handlePlaygroundStream(buildSources(), basePayload(), vi.fn());
    expect(activeStreamCount()).toBe(0);
  });
});

describe("cancelAllPlaygroundStreams — disconnect cleanup", () => {
  it("returns 0 when no streams are active", () => {
    expect(activeStreamCount()).toBe(0);
    expect(cancelAllPlaygroundStreams()).toBe(0);
  });

  it("aborts every active stream and clears the registry", async () => {
    // Spawn two slow streams that wait on the abort signal.
    const slowSSE = withSSESchema(async function* (ctx: { signal: AbortSignal }) {
      await new Promise((resolve) => {
        ctx.signal.addEventListener("abort", resolve, { once: true });
      });
    });
    const sources = buildSources(slowSSE);

    const ids: string[] = [];
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 2; i++) {
      promises.push(
        handlePlaygroundStream(sources, basePayload(), (res) => {
          ids.push(res.requestId);
        }),
      );
    }
    await new Promise((r) => setTimeout(r, 5));
    expect(activeStreamCount()).toBe(2);

    // Bulk-cancel as if the studio socket disconnected mid-flight.
    expect(cancelAllPlaygroundStreams()).toBe(2);
    expect(activeStreamCount()).toBe(0);

    await Promise.all(promises);

    // Both streams emit close{disconnect} via the SSE executor's onAbort hook.
    for (const id of ids) {
      expect(mockHooks.onStreamClose).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: id, reason: "disconnect" }),
      );
    }
  });
});

describe("cancelPlaygroundStream", () => {
  it("returns false for unknown requestId", () => {
    expect(cancelPlaygroundStream("nonexistent")).toBe(false);
  });

  it("returns true and aborts active stream", async () => {
    const slowSSE = withSSESchema(async function* (ctx: { signal: AbortSignal }) {
      await new Promise((resolve) => {
        ctx.signal.addEventListener("abort", resolve, { once: true });
      });
    });

    const sources = buildSources(slowSSE);
    let resolvedId = "";
    const promise = handlePlaygroundStream(sources, basePayload({ method: "stream" }), (res) => {
      resolvedId = res.requestId;
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(resolvedId).toBeTruthy();
    expect(activeStreamCount()).toBe(1);

    expect(cancelPlaygroundStream(resolvedId)).toBe(true);
    expect(activeStreamCount()).toBe(0);

    await promise;
    expect(mockHooks.onStreamClose).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: resolvedId, reason: "disconnect" }),
    );
  });
});

// ── executeSSEStream — driven via canonical in-process pipeline ─────────────

describe("executeSSEStream (canonical pipeline)", () => {
  it("emits onStreamOpen with caller-supplied requestId and mode=direct", async () => {
    const sources = buildSources();
    const ac = new AbortController();
    await executeSSEStream(sources, basePayload(), "req-1", ac.signal);

    expect(mockHooks.onStreamOpen).toHaveBeenCalled();
    const calls = mockHooks.onStreamOpen.mock.calls.map((c) => c[0] as Record<string, unknown>);
    // beginStream + updateMeta both fire with the same requestId.
    expect(new Set(calls.map((c) => c.requestId))).toEqual(new Set(["req-1"]));
    expect(calls[0]).toMatchObject({
      requestId: "req-1",
      source: "api",
      group: "chat",
      method: "stream",
      transport: "sse",
      mode: "direct",
    });
  });

  it("emits onStreamMessage for each yielded event with eventType from SSE event field", async () => {
    const sources = buildSources();
    await executeSSEStream(sources, basePayload(), "req-2", new AbortController().signal);

    expect(mockHooks.onStreamMessage).toHaveBeenCalledTimes(2);
    expect(mockHooks.onStreamMessage.mock.calls[0]![0]).toMatchObject({
      requestId: "req-2",
      seq: 1,
      eventType: "data",
    });
    expect(mockHooks.onStreamMessage.mock.calls[1]![0]).toMatchObject({
      requestId: "req-2",
      seq: 2,
      eventType: "update",
    });
  });

  it("emits onStreamClose with reason=complete after generator drains", async () => {
    const sources = buildSources();
    await executeSSEStream(sources, basePayload(), "req-3", new AbortController().signal);

    expect(mockHooks.onStreamClose).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-3", reason: "complete", eventCount: 2 }),
    );
  });

  it("emits onStreamClose(error) and onStreamError when generator throws", async () => {
    const throwingSSE = withSSESchema(async function* () {
      yield { data: { ok: true } };
      throw new Error("stream exploded");
    });
    const sources = buildSources(throwingSSE);

    await executeSSEStream(sources, basePayload(), "req-4", new AbortController().signal);

    expect(mockHooks.onStreamClose).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-4", reason: "error", eventCount: 1 }),
    );
    expect(mockHooks.onStreamError).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-4", error: "stream exploded" }),
    );
  });

  it("emits onStreamError when endpoint not found (no orphan stream:open)", async () => {
    const sources = buildSources();
    await executeSSEStream(
      sources,
      basePayload({ method: "nonexistent" }),
      "req-5",
      new AbortController().signal,
    );

    expect(mockHooks.onStreamError).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-5",
        error: expect.stringContaining("failed to resolve"),
      }),
    );
    expect(mockHooks.onStreamOpen).not.toHaveBeenCalled();
  });

  it("emits onStreamError when signal aborted before start", async () => {
    const sources = buildSources();
    const ac = new AbortController();
    ac.abort();

    await executeSSEStream(sources, basePayload(), "req-6", ac.signal);

    expect(mockHooks.onStreamError).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-6", error: "Stream cancelled before start" }),
    );
    expect(mockHooks.onStreamOpen).not.toHaveBeenCalled();
  });

  it("handles empty stream (no messages, clean complete)", async () => {
    const emptySSE = withSSESchema(async function* () {
      // yields nothing
    });
    const sources = buildSources(emptySSE);

    await executeSSEStream(sources, basePayload(), "req-7", new AbortController().signal);

    expect(mockHooks.onStreamMessage).not.toHaveBeenCalled();
    expect(mockHooks.onStreamClose).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-7", reason: "complete", eventCount: 0 }),
    );
  });

  it("runs middleware end-to-end (auth header reaches handler ctx)", async () => {
    let observedAuth: string | null = null;
    const sseWithCtx = withSSESchema(async function* (ctx: { headers: Headers }) {
      observedAuth = ctx.headers.get("authorization");
      yield { data: "ok" };
    });

    // Source with a wrap middleware that injects an Authorization header.
    const sources = {
      api: {
        options: {
          middleware: [
            {
              name: "auth-injector",
              phase: "wrap" as const,
              handler: async (ctx: { headers: Headers }, next: () => Promise<unknown>) => {
                ctx.headers.set("authorization", "Bearer playground-token");
                return await next();
              },
            },
          ],
          groups: { chat: { options: {}, stream: sseWithCtx } },
        },
      },
    } as unknown as Sources;

    await executeSSEStream(sources, basePayload(), "req-8", new AbortController().signal);
    expect(observedAuth).toBe("Bearer playground-token");
  });
});

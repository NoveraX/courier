import { describe, expect, it, vi } from "vitest";
import type { SubscriptionTracker, WSSocketContext } from "../src/adapter/ws-context";
import { closeSubscriptionEntry, extractHeaders } from "../src/adapter/ws-dispatch-helpers";

function createCtx(overrides: { onWSUntrack?: () => void; onStreamClose?: () => void } = {}): {
  ctx: WSSocketContext;
  subs: Map<string, SubscriptionTracker>;
} {
  const subs = new Map<string, SubscriptionTracker>();
  const ctx = {
    subscriptionIds: subs,
    dt: {
      onWSUntrack: overrides.onWSUntrack,
      onStreamClose: overrides.onStreamClose,
    },
  } as unknown as WSSocketContext;
  return { ctx, subs };
}

function seedTracker(subs: Map<string, SubscriptionTracker>, topic: string): SubscriptionTracker {
  const tracker: SubscriptionTracker = {
    requestId: `req-${topic}`,
    seq: { value: 3 },
    t0: performance.now(),
  };
  subs.set(topic, tracker);
  return tracker;
}

describe("extractHeaders", () => {
  it("snapshots Headers into a plain record", () => {
    const headers = new Headers();
    headers.set("x-foo", "1");
    headers.set("content-type", "application/json");

    const rec = extractHeaders(headers);

    expect(rec["x-foo"]).toBe("1");
    expect(rec["content-type"]).toBe("application/json");
  });
});

describe("closeSubscriptionEntry", () => {
  it("fires onWSUntrack and onStreamClose exactly once for one entry", () => {
    const onWSUntrack = vi.fn();
    const onStreamClose = vi.fn();
    const { ctx, subs } = createCtx({ onWSUntrack, onStreamClose });
    seedTracker(subs, "api.chat.room");

    closeSubscriptionEntry(ctx, "api.chat.room");

    expect(onWSUntrack).toHaveBeenCalledTimes(1);
    expect(onStreamClose).toHaveBeenCalledTimes(1);
    expect(onStreamClose).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-api.chat.room",
        reason: "complete",
        eventCount: 3,
      }),
    );
    expect(subs.size).toBe(0);
  });

  it("forwards the close reason to onStreamClose", () => {
    const onStreamClose = vi.fn();
    const { ctx, subs } = createCtx({ onStreamClose });
    seedTracker(subs, "api.chat.room");

    closeSubscriptionEntry(ctx, "api.chat.room", "error");

    expect(onStreamClose).toHaveBeenCalledWith(expect.objectContaining({ reason: "error" }));
  });

  it("is a no-op when topic is not subscribed", () => {
    const onWSUntrack = vi.fn();
    const onStreamClose = vi.fn();
    const { ctx } = createCtx({ onWSUntrack, onStreamClose });

    closeSubscriptionEntry(ctx, "api.unknown");

    expect(onWSUntrack).not.toHaveBeenCalled();
    expect(onStreamClose).not.toHaveBeenCalled();
  });

  it("fires hooks exactly once across three sequential calls (idempotency under same-microtask re-entry)", () => {
    const onWSUntrack = vi.fn();
    const onStreamClose = vi.fn();
    const { ctx, subs } = createCtx({ onWSUntrack, onStreamClose });
    seedTracker(subs, "api.chat.room");

    // Three calls in a row inside the same microtask. Without the
    // delete-before-fire claim, all three would observe the entry via
    // the initial Map.get() check, pass the !sub guard, and double-fire
    // both Studio hooks. Delete-first ensures only the first caller
    // observes a non-empty slot.
    closeSubscriptionEntry(ctx, "api.chat.room");
    closeSubscriptionEntry(ctx, "api.chat.room");
    closeSubscriptionEntry(ctx, "api.chat.room");

    expect(onWSUntrack).toHaveBeenCalledTimes(1);
    expect(onStreamClose).toHaveBeenCalledTimes(1);
    expect(subs.size).toBe(0);
  });

  it("survives a re-entrant close from inside an onWSUntrack hook", () => {
    let ctxRef!: WSSocketContext;
    const onWSUntrack = vi.fn(() => {
      // Re-entrant close attempt from a hook callback. Must not double-fire.
      closeSubscriptionEntry(ctxRef, "api.chat.room");
    });
    const onStreamClose = vi.fn();
    const seeded = createCtx({ onWSUntrack, onStreamClose });
    ctxRef = seeded.ctx;
    seedTracker(seeded.subs, "api.chat.room");

    closeSubscriptionEntry(ctxRef, "api.chat.room");

    expect(onWSUntrack).toHaveBeenCalledTimes(1);
    expect(onStreamClose).toHaveBeenCalledTimes(1);
    expect(seeded.subs.size).toBe(0);
  });

  it("only closes the targeted topic when multiple are tracked", () => {
    const onWSUntrack = vi.fn();
    const onStreamClose = vi.fn();
    const { ctx, subs } = createCtx({ onWSUntrack, onStreamClose });
    seedTracker(subs, "api.chat.room");
    seedTracker(subs, "api.feed");

    closeSubscriptionEntry(ctx, "api.chat.room");

    expect(onWSUntrack).toHaveBeenCalledTimes(1);
    expect(onWSUntrack).toHaveBeenCalledWith({ requestId: "req-api.chat.room" });
    expect(subs.has("api.chat.room")).toBe(false);
    expect(subs.has("api.feed")).toBe(true);
  });

  it("works when studio hooks are undefined (no-op)", () => {
    const { ctx, subs } = createCtx();
    seedTracker(subs, "api.chat.room");

    expect(() => closeSubscriptionEntry(ctx, "api.chat.room")).not.toThrow();
    expect(subs.size).toBe(0);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { SubscriptionTracker, WSSocketContext } from "../src/adapter/ws-context";
import { closeSubscriptionEntry, extractHeaders } from "../src/adapter/ws-dispatch-helpers";

function createCtx(overrides: { onWSUntrack?: () => void; onStreamClose?: () => void } = {}): {
  ctx: WSSocketContext;
  records: Set<SubscriptionTracker>;
} {
  const records = new Set<SubscriptionTracker>();
  const ctx = {
    records,
    dt: {
      onWSUntrack: overrides.onWSUntrack,
      onStreamClose: overrides.onStreamClose,
    },
  } as unknown as WSSocketContext;
  return { ctx, records };
}

/* An open record, as a subscription to the topic opened it. */
function seedTracker(records: Set<SubscriptionTracker>, topic: string): SubscriptionTracker {
  const tracker: SubscriptionTracker = {
    requestId: `req-${topic}`,
    seq: { value: 3 },
    t0: performance.now(),
  };
  records.add(tracker);
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
  it("fires onWSUntrack and onStreamClose exactly once for one record", () => {
    const onWSUntrack = vi.fn();
    const onStreamClose = vi.fn();
    const { ctx, records } = createCtx({ onWSUntrack, onStreamClose });
    const record = seedTracker(records, "api.chat.room");

    closeSubscriptionEntry(ctx, record);

    expect(onWSUntrack).toHaveBeenCalledTimes(1);
    expect(onStreamClose).toHaveBeenCalledTimes(1);
    expect(onStreamClose).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-api.chat.room",
        reason: "complete",
        eventCount: 3,
      }),
    );
    expect(records.size).toBe(0);
  });

  it("forwards the close reason to onStreamClose", () => {
    const onStreamClose = vi.fn();
    const { ctx, records } = createCtx({ onStreamClose });
    const record = seedTracker(records, "api.chat.room");

    closeSubscriptionEntry(ctx, record, "error");

    expect(onStreamClose).toHaveBeenCalledWith(expect.objectContaining({ reason: "error" }));
  });

  it("is a no-op for a record that is not open, or none", () => {
    const onWSUntrack = vi.fn();
    const onStreamClose = vi.fn();
    const { ctx } = createCtx({ onWSUntrack, onStreamClose });
    const neverOpened: SubscriptionTracker = { requestId: "r", seq: { value: 0 }, t0: 0 };

    closeSubscriptionEntry(ctx, neverOpened);
    closeSubscriptionEntry(ctx, undefined);

    expect(onWSUntrack).not.toHaveBeenCalled();
    expect(onStreamClose).not.toHaveBeenCalled();
  });

  it("fires hooks exactly once across three sequential calls (idempotency under same-microtask re-entry)", () => {
    const onWSUntrack = vi.fn();
    const onStreamClose = vi.fn();
    const { ctx, records } = createCtx({ onWSUntrack, onStreamClose });
    const record = seedTracker(records, "api.chat.room");

    // Three calls in a row inside the same microtask: the first takes the
    // record out before its hooks fire, so the others find it closed.
    closeSubscriptionEntry(ctx, record);
    closeSubscriptionEntry(ctx, record);
    closeSubscriptionEntry(ctx, record);

    expect(onWSUntrack).toHaveBeenCalledTimes(1);
    expect(onStreamClose).toHaveBeenCalledTimes(1);
    expect(records.size).toBe(0);
  });

  it("survives a re-entrant close from inside an onWSUntrack hook", () => {
    let ctxRef!: WSSocketContext;
    let recordRef!: SubscriptionTracker;
    const onWSUntrack = vi.fn(() => {
      // Re-entrant close attempt from a hook callback. Must not double-fire.
      closeSubscriptionEntry(ctxRef, recordRef);
    });
    const onStreamClose = vi.fn();
    const seeded = createCtx({ onWSUntrack, onStreamClose });
    ctxRef = seeded.ctx;
    recordRef = seedTracker(seeded.records, "api.chat.room");

    closeSubscriptionEntry(ctxRef, recordRef);

    expect(onWSUntrack).toHaveBeenCalledTimes(1);
    expect(onStreamClose).toHaveBeenCalledTimes(1);
    expect(seeded.records.size).toBe(0);
  });

  it("closes the record it is given alone, another of the same topic too", () => {
    const onWSUntrack = vi.fn();
    const onStreamClose = vi.fn();
    const { ctx, records } = createCtx({ onWSUntrack, onStreamClose });
    const room = seedTracker(records, "api.chat.room");
    const feed = seedTracker(records, "api.feed");
    const roomAgain: SubscriptionTracker = { requestId: "req-again", seq: { value: 0 }, t0: 0 };
    records.add(roomAgain);

    closeSubscriptionEntry(ctx, room);

    expect(onWSUntrack).toHaveBeenCalledTimes(1);
    expect(onWSUntrack).toHaveBeenCalledWith({ requestId: "req-api.chat.room" });
    expect([...records]).toEqual([feed, roomAgain]);
  });

  it("works when studio hooks are undefined (no-op)", () => {
    const { ctx, records } = createCtx();
    const record = seedTracker(records, "api.chat.room");

    expect(() => closeSubscriptionEntry(ctx, record)).not.toThrow();
    expect(records.size).toBe(0);
  });
});

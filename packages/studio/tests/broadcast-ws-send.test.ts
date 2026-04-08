/**
 * Tests for `broadcastWSSend` — the fan-out path used by
 * `ui-ws-send-handler.ts`. Mirrors the broadcast pattern documented for
 * `playground:stream:cancel` in studio-core/src/connect/socket.ts: the
 * Studio server doesn't know which app process owns a given requestId, so
 * it emits to every connected app socket and trusts the owner to answer
 * `ok:true`.
 *
 * Coverage:
 *  - empty namespace → friendly "No application connected" error
 *  - single owner among many → success even when others say no-op
 *  - nobody owns → most-actionable error wins (subscribed > generic > timeout)
 *  - per-socket timeout — a hung socket cannot block when another answered
 *  - all sockets time out → timeout error surfaced
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { broadcastWSSend } from "../src/server/broadcast-ws-send";
import type { AppSocket } from "../src/server/socket-data";

type EmitFn = (
  event: "playground:ws:send",
  payload: { requestId: string; topic: string; data: unknown },
  ack: (result: { ok: boolean; error?: string }) => void,
) => void;

function makeStubSocket(id: string, emit: EmitFn): AppSocket {
  return { id, emit } as unknown as AppSocket;
}

const PAYLOAD = { requestId: "r1", topic: "chat", data: { hello: "world" } };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("broadcastWSSend", () => {
  it("returns 'No application connected' when sockets is empty", async () => {
    await expect(broadcastWSSend([], PAYLOAD)).resolves.toEqual({
      ok: false,
      error: "No application connected",
    });
  });

  it("resolves ok:true when one of three sockets owns the requestId", async () => {
    const browser = makeStubSocket("browser", (_e, _p, ack) =>
      ack({ ok: false, error: "No active connection for requestId: r1" }),
    );
    const server = makeStubSocket("server", (_e, _p, ack) =>
      ack({ ok: false, error: "No active connection for requestId: r1" }),
    );
    const owner = makeStubSocket("owner", (_e, _p, ack) => ack({ ok: true }));

    const result = await broadcastWSSend([browser, server, owner], PAYLOAD);
    expect(result).toEqual({ ok: true });
  });

  it("aggregates errors and prefers the most actionable when nobody owns", async () => {
    const a = makeStubSocket("a", (_e, _p, ack) =>
      ack({ ok: false, error: "No active connection for requestId: r1" }),
    );
    const b = makeStubSocket("b", (_e, _p, ack) =>
      ack({ ok: false, error: "Not subscribed to topic: chat" }),
    );

    const result = await broadcastWSSend([a, b], PAYLOAD);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Not subscribed to topic: chat");
  });

  it("falls back to generic error when only generics are returned", async () => {
    const a = makeStubSocket("a", (_e, _p, ack) =>
      ack({ ok: false, error: "No active connection for requestId: r1" }),
    );
    const result = await broadcastWSSend([a], PAYLOAD);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("No active connection for requestId: r1");
  });

  it("does not block on a hung socket once another responds ok", async () => {
    const hung = makeStubSocket("hung", () => {
      // never acks
    });
    const owner = makeStubSocket("owner", (_e, _p, ack) => ack({ ok: true }));

    const promise = broadcastWSSend([hung, owner], PAYLOAD);
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it("surfaces a timeout error when every socket hangs", async () => {
    const a = makeStubSocket("a", () => undefined);
    const b = makeStubSocket("b", () => undefined);

    const promise = broadcastWSSend([a, b], PAYLOAD);
    // Advance past the per-socket timeout (5_000 ms).
    await vi.advanceTimersByTimeAsync(5_001);
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timed out/);
  });

  it("ignores duplicate acks from a non-owner that already timed out", async () => {
    let lateAck: ((r: { ok: boolean; error?: string }) => void) | undefined;
    const slow = makeStubSocket("slow", (_e, _p, ack) => {
      lateAck = ack;
    });
    const owner = makeStubSocket("owner", (_e, _p, ack) => ack({ ok: true }));

    const result = await broadcastWSSend([slow, owner], PAYLOAD);
    expect(result).toEqual({ ok: true });

    // The hung socket eventually responds; broadcastWSSend must NOT settle twice.
    expect(() => lateAck?.({ ok: false, error: "late" })).not.toThrow();
  });
});

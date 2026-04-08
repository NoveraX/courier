/**
 * Tests for `broadcastToApps` — the fire-and-forget UI → app fan-out used
 * by `playground:stream:cancel`.
 *
 * Cancel is keyed by `requestId` only (Studio UI does not know which app
 * owns a given stream), so the broadcast pattern hits every connected app
 * and lets the right one find its active stream and abort. The 0-apps
 * case returns the same `{ error: "No application connected" }` shape as
 * the rest of the UI → app handlers (`handlePlayground`, `handleReplay`,
 * `handleWSSend`) so Studio has a single user-visible signal for "your
 * app process exited".
 */

import { describe, expect, it, vi } from "vitest";

import { broadcastToApps } from "../src/server/ui-namespace";
import type { AppNamespace, AppSocket } from "../src/server/socket-data";

function makeStubSocket(id = "stub"): AppSocket {
  return {
    id,
    data: {},
    emit: vi.fn(),
  } as unknown as AppSocket;
}

function makeStubNamespace(sockets: AppSocket[]): AppNamespace {
  const map = new Map<string, AppSocket>();
  sockets.forEach((s, i) => map.set(`s${i}`, s));
  return { sockets: map } as unknown as AppNamespace;
}

describe("broadcastToApps", () => {
  it("returns { error } when zero apps are connected", () => {
    const ns = makeStubNamespace([]);
    const handler = broadcastToApps(ns, "playground:stream:cancel");
    const callback = vi.fn();

    handler({ requestId: "req-1" }, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ error: "No application connected" });
  });

  it("emits to every connected socket and returns { ok: true } on success", () => {
    const a = makeStubSocket();
    const b = makeStubSocket();
    const c = makeStubSocket();
    const ns = makeStubNamespace([a, b, c]);
    const handler = broadcastToApps(ns, "playground:stream:cancel");
    const callback = vi.fn();
    const payload = { requestId: "req-cancel-2" };

    handler(payload, callback);

    expect(a.emit).toHaveBeenCalledTimes(1);
    expect(b.emit).toHaveBeenCalledTimes(1);
    expect(c.emit).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ ok: true });
  });

  it("forwards the payload byte-identically (no transformation)", () => {
    const a = makeStubSocket();
    const ns = makeStubNamespace([a]);
    const handler = broadcastToApps(ns, "playground:stream:cancel");
    const payload = { requestId: "x", extra: { nested: [1, 2, 3] } };

    handler(payload, vi.fn());

    expect(a.emit).toHaveBeenCalledWith(
      "playground:stream:cancel",
      payload,
      expect.any(Function),
    );
  });

  it("passes a no-op callback as the third arg so legacy handlers don't crash", () => {
    const a = makeStubSocket();
    const ns = makeStubNamespace([a]);
    const handler = broadcastToApps(ns, "playground:stream:cancel");

    handler({ requestId: "y" }, vi.fn());

    const calls = (a.emit as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    const ack = calls[0]![2];
    expect(typeof ack).toBe("function");
    // Calling the no-op should not throw — it returns undefined.
    expect(() => ack()).not.toThrow();
  });

  it("invokes the UI callback synchronously after the broadcast (no awaited promises)", () => {
    const a = makeStubSocket();
    const ns = makeStubNamespace([a]);
    const handler = broadcastToApps(ns, "playground:stream:cancel");

    let calledBeforeReturn = false;
    const callback = vi.fn(() => {
      calledBeforeReturn = true;
    });

    handler({ requestId: "z" }, callback);

    expect(calledBeforeReturn).toBe(true);
  });

  it("per-app ack surfaces { error } responses without breaking aggregate { ok: true }", async () => {
    // Hook the studio logger so we can assert that an app returning an
    // `error` payload leaves a trace, instead of being silently swallowed.
    const { logger } = await import("@noverax/nexus");
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    try {
      const a = makeStubSocket("app-a");
      const ns = makeStubNamespace([a]);
      const handler = broadcastToApps(ns, "playground:stream:cancel");
      const callback = vi.fn();

      handler({ requestId: "boom" }, callback);

      // Aggregate UI response unchanged.
      expect(callback).toHaveBeenCalledWith({ ok: true });

      // Drive the per-socket ack with an error payload — this is what an
      // app handler would do if it failed to abort a stream.
      const calls = (a.emit as ReturnType<typeof vi.fn>).mock.calls;
      const ack = calls[0]![2] as (r: unknown) => void;
      ack({ error: "stream not found" });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      const message = String(warnSpy.mock.calls[0]![1]);
      expect(message).toContain("playground:stream:cancel");
      expect(message).toContain("app-a");
      expect(message).toContain("stream not found");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("per-app ack stays silent on { ok: true } responses", async () => {
    const { logger } = await import("@noverax/nexus");
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    try {
      const a = makeStubSocket("app-b");
      const ns = makeStubNamespace([a]);
      const handler = broadcastToApps(ns, "playground:stream:cancel");

      handler({ requestId: "ok" }, vi.fn());
      const calls = (a.emit as ReturnType<typeof vi.fn>).mock.calls;
      const ack = calls[0]![2] as (r: unknown) => void;
      ack({ ok: true });
      ack(undefined);

      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("uses the configured event name for the broadcast", () => {
    const a = makeStubSocket();
    const ns = makeStubNamespace([a]);
    const handler = broadcastToApps(ns, "custom:event:name");

    handler({ x: 1 }, vi.fn());

    const calls = (a.emit as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe("custom:event:name");
  });
});

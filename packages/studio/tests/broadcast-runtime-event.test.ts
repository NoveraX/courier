/**
 * Tests for `sanitizeRuntimeEvent` in `broadcast-runtime-event.ts` — the
 * whitelist gate for runtime events flowing into the UI namespace.
 */

import { describe, expect, it } from "vitest";
import { sanitizeRuntimeEvent } from "../src/server/broadcast-runtime-event";

describe("sanitizeRuntimeEvent", () => {
  it("allows a known mock event type", () => {
    const result = sanitizeRuntimeEvent({
      type: "mock:server:connect",
      serverId: "srv-1",
      port: 3001,
    });
    expect(result).toEqual({ type: "mock:server:connect", serverId: "srv-1", port: 3001 });
  });

  it("allows all 12 whitelisted event types", () => {
    const types = [
      "mock:server:connect",
      "mock:server:disconnect",
      "mock:route:list",
      "mock:store:snapshot",
      "mock:store:change",
      "mock:scenario:list",
      "mock:scenario:active",
      "mock:request:start",
      "mock:request:end",
      "mock:request:error",
      "mock:network:config",
      "mock:experiment:event",
    ];
    for (const type of types) {
      expect(sanitizeRuntimeEvent({ type, serverId: "s" })).toBeDefined();
    }
  });

  it("rejects an unknown event type", () => {
    expect(sanitizeRuntimeEvent({ type: "custom:hack", serverId: "s" })).toBeUndefined();
  });

  it("rejects missing type", () => {
    expect(sanitizeRuntimeEvent({ serverId: "s" })).toBeUndefined();
  });

  it("rejects missing serverId", () => {
    expect(sanitizeRuntimeEvent({ type: "mock:server:connect" })).toBeUndefined();
  });

  it("rejects empty serverId", () => {
    expect(sanitizeRuntimeEvent({ type: "mock:server:connect", serverId: "" })).toBeUndefined();
  });

  it("rejects non-object input", () => {
    expect(sanitizeRuntimeEvent(null)).toBeUndefined();
    expect(sanitizeRuntimeEvent("string")).toBeUndefined();
    expect(sanitizeRuntimeEvent(42)).toBeUndefined();
  });

  it("rejects array input", () => {
    expect(sanitizeRuntimeEvent([{ type: "mock:server:connect", serverId: "s" }])).toBeUndefined();
  });

  it("strips prototype pollution keys", () => {
    const raw = { type: "mock:server:connect", serverId: "s", normal: 1 };
    Object.defineProperty(raw, "__proto__", { value: { admin: true }, enumerable: true });
    const result = sanitizeRuntimeEvent(raw);
    expect(result).toBeDefined();
    expect(Object.hasOwn(result!, "__proto__")).toBe(false);
    expect(result!.normal).toBe(1);
  });

  it("strips constructor and prototype keys", () => {
    const raw = {
      type: "mock:server:connect",
      serverId: "s",
      constructor: "evil",
      prototype: "evil",
    };
    const result = sanitizeRuntimeEvent(raw);
    expect(result).toBeDefined();
    expect(Object.hasOwn(result!, "constructor")).toBe(false);
    expect(Object.hasOwn(result!, "prototype")).toBe(false);
  });

  it("preserves extra fields after sanitization", () => {
    const result = sanitizeRuntimeEvent({
      type: "mock:store:snapshot",
      serverId: "srv-1",
      collections: [{ name: "users", count: 5 }],
    });
    expect(result?.collections).toEqual([{ name: "users", count: 5 }]);
  });
});

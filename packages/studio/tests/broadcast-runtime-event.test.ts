/**
 * Tests for `sanitizeRuntimeEvent` in `broadcast-runtime-event.ts` — the
 * whitelist gate for runtime events flowing into the UI namespace. A runtime
 * reports the requests, streams and channels it serves; a managed mock's
 * events reach the UI from Studio's mock manager, never through a runtime.
 */

import { RUNTIME_EVENT_TYPES } from "@noverax/courier-studio-core/runtime";
import { describe, expect, it } from "vitest";
import { sanitizeRuntimeEvent } from "../src/server/broadcast-runtime-event";

describe("sanitizeRuntimeEvent", () => {
  it("allows a request event, which names no server", () => {
    const result = sanitizeRuntimeEvent({ type: "request:start", id: "r1", source: "api" });
    expect(result).toEqual({ type: "request:start", id: "r1", source: "api" });
  });

  it("allows every event type a runtime sends", () => {
    for (const type of RUNTIME_EVENT_TYPES) {
      expect(sanitizeRuntimeEvent({ type })).toBeDefined();
    }
  });

  it("rejects a mock event, which no runtime sends", () => {
    expect(
      sanitizeRuntimeEvent({ type: "mock:server:connect", serverId: "srv-1" }),
    ).toBeUndefined();
    expect(
      sanitizeRuntimeEvent({ type: "mock:store:snapshot", serverId: "srv-1" }),
    ).toBeUndefined();
  });

  it("rejects an unknown event type", () => {
    expect(sanitizeRuntimeEvent({ type: "custom:hack" })).toBeUndefined();
  });

  it("rejects missing type", () => {
    expect(sanitizeRuntimeEvent({ id: "r1" })).toBeUndefined();
  });

  it("rejects non-object input", () => {
    expect(sanitizeRuntimeEvent(null)).toBeUndefined();
    expect(sanitizeRuntimeEvent("string")).toBeUndefined();
    expect(sanitizeRuntimeEvent(42)).toBeUndefined();
  });

  it("rejects array input", () => {
    expect(sanitizeRuntimeEvent([{ type: "request:start" }])).toBeUndefined();
  });

  it("strips prototype pollution keys", () => {
    const raw = { type: "request:start", normal: 1 };
    Object.defineProperty(raw, "__proto__", { value: { admin: true }, enumerable: true });
    const result = sanitizeRuntimeEvent(raw);
    expect(result).toBeDefined();
    expect(Object.hasOwn(result ?? {}, "__proto__")).toBe(false);
    expect(result?.normal).toBe(1);
  });

  it("strips constructor and prototype keys", () => {
    const raw = { type: "request:end", constructor: "evil", prototype: "evil" };
    const result = sanitizeRuntimeEvent(raw);
    expect(result).toBeDefined();
    expect(Object.hasOwn(result ?? {}, "constructor")).toBe(false);
    expect(Object.hasOwn(result ?? {}, "prototype")).toBe(false);
  });

  it("preserves extra fields after sanitization", () => {
    const result = sanitizeRuntimeEvent({ type: "request:end", id: "r1", status: 200, data: [1] });
    expect(result).toEqual({ type: "request:end", id: "r1", status: 200, data: [1] });
  });
});

import { describe, expect, it } from "vitest";

import type { WSMessage, WSMessageType } from "../src/realtime/ws/ws-protocol";
import { decodeMessage, encodeMessage } from "../src/realtime/ws/ws-protocol";

describe("encodeMessage", () => {
  it("produces valid JSON with all fields", () => {
    const msg: WSMessage = {
      id: "req-1",
      type: "data",
      source: "api",
      topic: "users:getAll",
      payload: { items: [1, 2] },
      seq: 42,
      error: { code: 500, message: "fail" },
    };

    const json = encodeMessage(msg);
    const parsed = JSON.parse(json);

    expect(parsed.id).toBe("req-1");
    expect(parsed.type).toBe("data");
    expect(parsed.source).toBe("api");
    expect(parsed.topic).toBe("users:getAll");
    expect(parsed.payload).toEqual({ items: [1, 2] });
    expect(parsed.seq).toBe(42);
    expect(parsed.error).toEqual({ code: 500, message: "fail" });
  });

  it("omits undefined fields", () => {
    const json = encodeMessage({ type: "ping" });
    const parsed = JSON.parse(json);

    expect(Object.keys(parsed)).toEqual(["type"]);
  });
});

describe("decodeMessage", () => {
  it("round-trips with encodeMessage", () => {
    const original: WSMessage = {
      id: "abc",
      type: "subscribe",
      topic: "chat:messages",
      payload: { filter: true },
      seq: 7,
    };

    const result = decodeMessage(encodeMessage(original));
    expect(result).toEqual(original);
  });

  it("throws on invalid JSON", () => {
    expect(() => decodeMessage("{broken")).toThrow("invalid JSON");
  });

  it("throws on missing type field", () => {
    expect(() => decodeMessage('{"id":"x"}')).toThrow("missing 'type'");
  });

  it("throws on invalid type value", () => {
    expect(() => decodeMessage('{"type":"bogus"}')).toThrow("invalid type");
  });

  it("handles all message types", () => {
    const types: WSMessageType[] = [
      "subscribe", "unsubscribe", "data", "message",
      "ping", "pong", "error", "subscribed", "unsubscribed", "auth", "auth_required",
    ];

    for (const type of types) {
      const msg = decodeMessage(encodeMessage({ type }));
      expect(msg.type).toBe(type);
    }
  });

  it("preserves optional fields", () => {
    const raw = JSON.stringify({
      id: "r-99",
      type: "error",
      source: "payments",
      topic: "orders:create",
      payload: null,
      seq: 0,
      error: { code: 400, message: "bad request" },
    });

    const msg = decodeMessage(raw);

    expect(msg.id).toBe("r-99");
    expect(msg.source).toBe("payments");
    expect(msg.topic).toBe("orders:create");
    expect(msg.payload).toBeNull();
    expect(msg.seq).toBe(0);
    expect(msg.error).toEqual({ code: 400, message: "bad request" });
  });
});

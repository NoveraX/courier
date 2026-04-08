import { describe, expect, it } from "vitest";
import {
  sanitizePlaygroundExecutePayload,
  sanitizePlaygroundStreamPayload,
  sanitizePlaygroundWSSendPayload,
} from "../src/connect/sanitize-playground-payload";

describe("sanitizePlaygroundExecutePayload", () => {
  const valid = {
    source: "api",
    group: "users",
    method: "getAll",
    variables: { id: 1 },
    headers: { "x-token": "abc" },
    mode: "direct" as const,
  };

  it("accepts a fully-valid payload", () => {
    expect(sanitizePlaygroundExecutePayload(valid)).toEqual(valid);
  });

  it("defaults mode to 'direct' when missing or invalid", () => {
    expect(sanitizePlaygroundExecutePayload({ ...valid, mode: "wat" })?.mode).toBe("direct");
    expect(sanitizePlaygroundExecutePayload({ ...valid, mode: undefined })?.mode).toBe("direct");
  });

  it("preserves an empty group (root-level endpoints)", () => {
    expect(sanitizePlaygroundExecutePayload({ ...valid, group: "" })?.group).toBe("");
  });

  it("rejects missing source/method", () => {
    expect(sanitizePlaygroundExecutePayload({ ...valid, source: "" })).toBeUndefined();
    expect(sanitizePlaygroundExecutePayload({ ...valid, source: 42 })).toBeUndefined();
    expect(sanitizePlaygroundExecutePayload({ ...valid, method: undefined })).toBeUndefined();
  });

  it("rejects non-object payloads", () => {
    expect(sanitizePlaygroundExecutePayload(null)).toBeUndefined();
    expect(sanitizePlaygroundExecutePayload(undefined)).toBeUndefined();
    expect(sanitizePlaygroundExecutePayload("not an object")).toBeUndefined();
    expect(sanitizePlaygroundExecutePayload([])).toBeUndefined();
  });

  it("drops non-string header entries", () => {
    const out = sanitizePlaygroundExecutePayload({
      ...valid,
      headers: { good: "x", bad: 42, also_bad: null, nested: {} },
    });
    expect(out?.headers).toEqual({ good: "x" });
  });

  it("drops headers with CR/LF (header injection guard)", () => {
    const out = sanitizePlaygroundExecutePayload({
      ...valid,
      headers: {
        "x-injected": "value\r\nX-Smuggled: yes",
        "x-name\r\n": "ok",
        clean: "ok",
      },
    });
    expect(out?.headers).toEqual({ clean: "ok" });
  });

  it("preserves arbitrary variables shape (passthrough)", () => {
    const variables = { a: [1, 2], b: { c: "d" } };
    expect(sanitizePlaygroundExecutePayload({ ...valid, variables })?.variables).toBe(variables);
  });
});

describe("sanitizePlaygroundStreamPayload", () => {
  const valid = {
    source: "api",
    group: "events",
    method: "stream",
    variables: undefined,
    transport: "sse" as const,
  };

  it("accepts minimal valid payload", () => {
    expect(sanitizePlaygroundStreamPayload(valid)).toEqual({
      ...valid,
      headers: {},
    });
  });

  it("rejects unknown transport", () => {
    expect(sanitizePlaygroundStreamPayload({ ...valid, transport: "http" })).toBeUndefined();
    expect(sanitizePlaygroundStreamPayload({ ...valid, transport: undefined })).toBeUndefined();
  });

  it("preserves optional mode when valid", () => {
    expect(
      sanitizePlaygroundStreamPayload({ ...valid, mode: "proxy" })?.mode,
    ).toBe("proxy");
    expect(sanitizePlaygroundStreamPayload({ ...valid, mode: "wat" })?.mode).toBeUndefined();
  });
});

describe("sanitizePlaygroundWSSendPayload", () => {
  it("accepts valid payload", () => {
    expect(
      sanitizePlaygroundWSSendPayload({ requestId: "r1", topic: "msg", data: { x: 1 } }),
    ).toEqual({ requestId: "r1", topic: "msg", data: { x: 1 } });
  });

  it("preserves arbitrary data shape", () => {
    const data = { nested: { foo: "bar" } };
    expect(sanitizePlaygroundWSSendPayload({ requestId: "r1", topic: "t", data })?.data).toBe(data);
  });

  it("preserves an empty topic (broadcast)", () => {
    expect(
      sanitizePlaygroundWSSendPayload({ requestId: "r1", topic: "", data: null }),
    ).toEqual({ requestId: "r1", topic: "", data: null });
  });

  it("rejects missing requestId/topic", () => {
    expect(sanitizePlaygroundWSSendPayload({ requestId: "", topic: "t" })).toBeUndefined();
    expect(sanitizePlaygroundWSSendPayload({ requestId: "r1" })).toBeUndefined();
    expect(sanitizePlaygroundWSSendPayload({ topic: "t" })).toBeUndefined();
  });

  it("rejects non-object payloads", () => {
    expect(sanitizePlaygroundWSSendPayload(null)).toBeUndefined();
    expect(sanitizePlaygroundWSSendPayload([])).toBeUndefined();
    expect(sanitizePlaygroundWSSendPayload("string")).toBeUndefined();
  });
});

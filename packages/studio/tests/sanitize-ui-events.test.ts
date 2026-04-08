import { describe, expect, it } from "vitest";

import {
  sanitizeUiPlaygroundPayload,
  sanitizeUiReplayPayload,
  sanitizeUiWSSendPayload,
} from "../src/server/sanitize-ui-events";

describe("sanitizeUiPlaygroundPayload", () => {
  const validPayload = {
    source: "api",
    group: "users",
    method: "getAll",
    variables: { page: 1 },
    headers: { authorization: "Bearer x" },
    mode: "direct" as const,
  };

  it("accepts a well-formed payload and preserves variables", () => {
    const result = sanitizeUiPlaygroundPayload(validPayload);

    expect(result).toEqual(validPayload);
  });

  it("preserves an optional sessionId when present and non-empty", () => {
    const result = sanitizeUiPlaygroundPayload({ ...validPayload, sessionId: "sess-1" });

    expect(result?.sessionId).toBe("sess-1");
  });

  it("drops sessionId when empty string", () => {
    const result = sanitizeUiPlaygroundPayload({ ...validPayload, sessionId: "" });

    expect(result?.sessionId).toBeUndefined();
  });

  it("drops sessionId when not a string", () => {
    const result = sanitizeUiPlaygroundPayload({ ...validPayload, sessionId: 123 });

    expect(result?.sessionId).toBeUndefined();
  });

  it("rejects non-object inputs", () => {
    expect(sanitizeUiPlaygroundPayload(null)).toBeUndefined();
    expect(sanitizeUiPlaygroundPayload(undefined)).toBeUndefined();
    expect(sanitizeUiPlaygroundPayload("string")).toBeUndefined();
    expect(sanitizeUiPlaygroundPayload(42)).toBeUndefined();
    expect(sanitizeUiPlaygroundPayload([])).toBeUndefined();
  });

  it("rejects when source/group/method missing or empty", () => {
    expect(sanitizeUiPlaygroundPayload({ ...validPayload, source: "" })).toBeUndefined();
    expect(sanitizeUiPlaygroundPayload({ ...validPayload, group: undefined })).toBeUndefined();
    expect(sanitizeUiPlaygroundPayload({ ...validPayload, method: 0 })).toBeUndefined();
  });

  it("rejects unknown mode values", () => {
    expect(
      sanitizeUiPlaygroundPayload({ ...validPayload, mode: "indirect" as never }),
    ).toBeUndefined();
    expect(sanitizeUiPlaygroundPayload({ ...validPayload, mode: 1 as never })).toBeUndefined();
  });

  it("rejects when headers is not a plain object", () => {
    expect(
      sanitizeUiPlaygroundPayload({ ...validPayload, headers: "x-foo: bar" as never }),
    ).toBeUndefined();
    expect(
      sanitizeUiPlaygroundPayload({ ...validPayload, headers: ["a", "b"] as never }),
    ).toBeUndefined();
  });

  it("treats undefined headers as an empty record (defensive default)", () => {
    const result = sanitizeUiPlaygroundPayload({ ...validPayload, headers: undefined });

    expect(result?.headers).toEqual({});
  });

  it("strips header values that are not strings", () => {
    const result = sanitizeUiPlaygroundPayload({
      ...validPayload,
      headers: { good: "value", bad: 42, alsoBad: { nested: "no" } } as never,
    });

    expect(result?.headers).toEqual({ good: "value" });
  });

  it("strips dangerous header keys (__proto__, constructor, prototype)", () => {
    const result = sanitizeUiPlaygroundPayload({
      ...validPayload,
      headers: { authorization: "ok", __proto__: "evil", constructor: "x", prototype: "y" } as never,
    });

    expect(result?.headers).toEqual({ authorization: "ok" });
  });

  it("does not propagate __proto__ pollution from a JSON.parse payload", () => {
    // JSON.parse('{"__proto__":...}') creates an OWN data property `__proto__`
    // (CreateDataProperty bypasses the special setter). The sanitizer copies
    // only whitelisted fields by name, so the polluted key never reaches the
    // result and Object.prototype stays untouched.
    const tampered = JSON.parse(
      '{"source":"api","group":"users","method":"getAll","mode":"direct","headers":{},"__proto__":{"polluted":true}}',
    );

    const result = sanitizeUiPlaygroundPayload(tampered);

    expect(result).toBeDefined();
    // The polluted key never lands on the result as an own property and the
    // global Object.prototype is not contaminated by an unrelated probe.
    expect(Object.hasOwn(result as object, "polluted")).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("variables passes through unchanged (object, array, primitive, null)", () => {
    expect(
      sanitizeUiPlaygroundPayload({ ...validPayload, variables: { nested: { x: 1 } } })?.variables,
    ).toEqual({ nested: { x: 1 } });
    expect(sanitizeUiPlaygroundPayload({ ...validPayload, variables: [1, 2, 3] })?.variables).toEqual([
      1, 2, 3,
    ]);
    expect(sanitizeUiPlaygroundPayload({ ...validPayload, variables: "raw" })?.variables).toBe("raw");
    expect(sanitizeUiPlaygroundPayload({ ...validPayload, variables: null })?.variables).toBeNull();
  });

  it("accepts both direct and proxy modes", () => {
    expect(sanitizeUiPlaygroundPayload({ ...validPayload, mode: "direct" })).toBeDefined();
    expect(sanitizeUiPlaygroundPayload({ ...validPayload, mode: "proxy" })).toBeDefined();
  });
});

describe("sanitizeUiReplayPayload", () => {
  const validReplay = {
    source: "api",
    group: "users",
    method: "getById",
    variables: { id: 1 },
    headers: { "x-trace": "abc" },
    mode: "proxy" as const,
  };

  it("accepts a well-formed replay payload", () => {
    expect(sanitizeUiReplayPayload(validReplay)).toEqual(validReplay);
  });

  it("rejects when any identity string is empty", () => {
    expect(sanitizeUiReplayPayload({ ...validReplay, source: "" })).toBeUndefined();
    expect(sanitizeUiReplayPayload({ ...validReplay, method: "" })).toBeUndefined();
  });

  it("rejects unknown mode", () => {
    expect(sanitizeUiReplayPayload({ ...validReplay, mode: "ssr" as never })).toBeUndefined();
  });

  it("rejects malformed headers (string)", () => {
    expect(
      sanitizeUiReplayPayload({ ...validReplay, headers: "not-an-object" as never }),
    ).toBeUndefined();
  });

  it("strips non-string header values", () => {
    expect(
      sanitizeUiReplayPayload({
        ...validReplay,
        headers: { keep: "yes", drop: 1 } as never,
      })?.headers,
    ).toEqual({ keep: "yes" });
  });

  it("does not include sessionId in the result shape", () => {
    const result = sanitizeUiReplayPayload({ ...validReplay, sessionId: "should-be-ignored" });

    expect(result).toBeDefined();
    expect((result as unknown as Record<string, unknown>).sessionId).toBeUndefined();
  });
});

describe("sanitizeUiWSSendPayload", () => {
  it("accepts a well-formed payload and passes data through", () => {
    const payload = { requestId: "req-1", topic: "api.chat.room", data: { hello: "world" } };

    expect(sanitizeUiWSSendPayload(payload)).toEqual(payload);
  });

  it("rejects empty/missing requestId", () => {
    expect(sanitizeUiWSSendPayload({ requestId: "", topic: "t", data: 1 })).toBeUndefined();
    expect(sanitizeUiWSSendPayload({ topic: "t", data: 1 })).toBeUndefined();
  });

  it("rejects empty/missing topic", () => {
    expect(sanitizeUiWSSendPayload({ requestId: "r", topic: "", data: 1 })).toBeUndefined();
    expect(sanitizeUiWSSendPayload({ requestId: "r", data: 1 })).toBeUndefined();
  });

  it("data passes through with arbitrary shapes", () => {
    expect(
      sanitizeUiWSSendPayload({ requestId: "r", topic: "t", data: undefined })?.data,
    ).toBeUndefined();
    expect(sanitizeUiWSSendPayload({ requestId: "r", topic: "t", data: 0 })?.data).toBe(0);
    expect(sanitizeUiWSSendPayload({ requestId: "r", topic: "t", data: [1, 2] })?.data).toEqual([
      1, 2,
    ]);
  });

  it("rejects non-object root", () => {
    expect(sanitizeUiWSSendPayload(null)).toBeUndefined();
    expect(sanitizeUiWSSendPayload("foo")).toBeUndefined();
    expect(sanitizeUiWSSendPayload([])).toBeUndefined();
  });
});

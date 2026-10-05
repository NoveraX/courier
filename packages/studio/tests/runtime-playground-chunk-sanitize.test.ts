/**
 * Tests for the runtime → server → UI sanitizers in
 * `runtime-playground-chunk-sanitize.ts`: sanitizeChunk, sanitizeEnd,
 * sanitizeError.
 */

import { describe, expect, it } from "vitest";
import {
  sanitizeChunk,
  sanitizeEnd,
  sanitizeError,
} from "../src/server/runtime-playground-chunk-sanitize";

describe("sanitizeChunk", () => {
  it("accepts a valid http-result chunk", () => {
    const result = sanitizeChunk({
      rid: "r-1",
      chunk: { kind: "http-result", status: 200, data: { ok: true } },
    });
    expect(result).toEqual({
      rid: "r-1",
      chunk: { kind: "http-result", status: 200, data: { ok: true } },
    });
  });

  it("accepts http-result with error string", () => {
    const result = sanitizeChunk({
      rid: "r-1",
      chunk: { kind: "http-result", status: 500, error: "Internal" },
    });
    expect(result?.chunk).toEqual({ kind: "http-result", status: 500, error: "Internal" });
  });

  it("keeps the response headers of an http-result", () => {
    const result = sanitizeChunk({
      rid: "r-1",
      chunk: { kind: "http-result", status: 201, data: {}, headers: { location: "/users/3" } },
    });
    expect(result?.chunk).toEqual({
      kind: "http-result",
      status: 201,
      data: {},
      headers: { location: "/users/3" },
    });
  });

  it("drops headers of an http-result that are not all strings", () => {
    const result = sanitizeChunk({
      rid: "r-1",
      chunk: { kind: "http-result", status: 200, data: {}, headers: { count: 3 } },
    });
    expect(result?.chunk).toEqual({ kind: "http-result", status: 200, data: {} });
  });

  it("accepts a valid sse-event chunk", () => {
    const result = sanitizeChunk({
      rid: "r-1",
      chunk: { kind: "sse-event", event: { data: "hello" } },
    });
    expect(result?.chunk).toEqual({ kind: "sse-event", event: { data: "hello" } });
  });

  it("accepts a valid ws-message chunk", () => {
    const result = sanitizeChunk({
      rid: "r-1",
      chunk: { kind: "ws-message", data: "ping" },
    });
    expect(result?.chunk).toEqual({ kind: "ws-message", data: "ping" });
  });

  it("passes on that a channel connected, and nothing it carried besides", () => {
    const result = sanitizeChunk({ rid: "r-1", chunk: { kind: "ws-open", extra: "x" } });
    expect(result?.chunk).toEqual({ kind: "ws-open" });
  });

  it("rejects unknown chunk kind", () => {
    expect(sanitizeChunk({ rid: "r-1", chunk: { kind: "unknown" } })).toBeNull();
  });

  it("rejects missing chunk field", () => {
    expect(sanitizeChunk({ rid: "r-1" })).toBeNull();
  });

  it("rejects non-object chunk", () => {
    expect(sanitizeChunk({ rid: "r-1", chunk: "string" })).toBeNull();
  });

  it("rejects chunk with prototype pollution", () => {
    const evil = Object.create(null);
    evil.kind = "http-result";
    evil.status = 200;
    // biome-ignore lint/suspicious/noProto: the test hands the guard the very key it must refuse
    evil.__proto__ = { admin: true };
    expect(sanitizeChunk({ rid: "r-1", chunk: evil })).toBeNull();
  });

  it("rejects http-result with non-finite status", () => {
    expect(sanitizeChunk({ rid: "r-1", chunk: { kind: "http-result", status: NaN } })).toBeNull();
    expect(
      sanitizeChunk({ rid: "r-1", chunk: { kind: "http-result", status: Infinity } }),
    ).toBeNull();
  });

  it("rejects sse-event missing event field", () => {
    expect(sanitizeChunk({ rid: "r-1", chunk: { kind: "sse-event" } })).toBeNull();
  });

  it("rejects ws-message missing data field", () => {
    expect(sanitizeChunk({ rid: "r-1", chunk: { kind: "ws-message" } })).toBeNull();
  });

  it("rejects non-object raw", () => {
    expect(sanitizeChunk(null)).toBeNull();
    expect(sanitizeChunk("string")).toBeNull();
    expect(sanitizeChunk(42)).toBeNull();
  });

  it("rejects empty rid", () => {
    expect(sanitizeChunk({ rid: "", chunk: { kind: "sse-event", event: {} } })).toBeNull();
  });
});

describe("sanitizeEnd", () => {
  it("accepts a valid end payload with durationMs", () => {
    const result = sanitizeEnd({ rid: "r-1", summary: { durationMs: 123 } });
    expect(result).toEqual({ rid: "r-1", summary: { durationMs: 123 } });
  });

  it("accepts end payload with optional count", () => {
    const result = sanitizeEnd({ rid: "r-1", summary: { durationMs: 50, count: 10 } });
    expect(result?.summary).toEqual({ durationMs: 50, count: 10 });
  });

  it("strips non-finite count", () => {
    const result = sanitizeEnd({ rid: "r-1", summary: { durationMs: 50, count: NaN } });
    expect(result?.summary).toEqual({ durationMs: 50 });
  });

  it("rejects missing summary", () => {
    expect(sanitizeEnd({ rid: "r-1" })).toBeNull();
  });

  it("rejects non-finite durationMs", () => {
    expect(sanitizeEnd({ rid: "r-1", summary: { durationMs: Infinity } })).toBeNull();
    expect(sanitizeEnd({ rid: "r-1", summary: { durationMs: NaN } })).toBeNull();
  });

  it("rejects non-object summary", () => {
    expect(sanitizeEnd({ rid: "r-1", summary: "fast" })).toBeNull();
  });

  it("rejects non-object raw", () => {
    expect(sanitizeEnd(null)).toBeNull();
  });
});

describe("sanitizeError", () => {
  it("accepts a valid error payload", () => {
    const result = sanitizeError({ rid: "r-1", error: { message: "timeout" } });
    expect(result).toEqual({ rid: "r-1", error: { message: "timeout" } });
  });

  it("rejects missing error.message", () => {
    expect(sanitizeError({ rid: "r-1", error: {} })).toBeNull();
    expect(sanitizeError({ rid: "r-1", error: { message: 123 } })).toBeNull();
  });

  it("rejects non-object error field", () => {
    expect(sanitizeError({ rid: "r-1", error: "string" })).toBeNull();
  });

  it("rejects non-object raw", () => {
    expect(sanitizeError(null)).toBeNull();
    expect(sanitizeError(42)).toBeNull();
  });

  it("rejects empty rid", () => {
    expect(sanitizeError({ rid: "", error: { message: "x" } })).toBeNull();
  });
});

describe("an upload's progress from a runtime", () => {
  it("passes with its byte counts and percentage", () => {
    const chunk = { kind: "upload-progress", loaded: 5, total: 10, percentage: 50 };

    expect(sanitizeChunk({ rid: "r1", chunk })).toEqual({ rid: "r1", chunk });
  });

  it("is dropped when a count is not a number", () => {
    const chunk = { kind: "upload-progress", loaded: "5", total: 10, percentage: 50 };

    expect(sanitizeChunk({ rid: "r1", chunk })).toBeNull();
  });
});

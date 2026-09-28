/**
 * Wire-boundary type guard coverage for `binding:snapshot` and
 * `binding:error` payloads. The Socket.IO client cannot validate event
 * shapes — these guards are the single trust boundary on the UI side.
 */

import { describe, expect, it } from "vitest";

import {
  isBindingErrorPayload,
  isBindingSnapshot,
} from "../src/socket/binding-guards";

describe("isBindingSnapshot", () => {
  it("accepts a well-formed empty snapshot", () => {
    expect(isBindingSnapshot({ rows: [], runtimeCount: 0, sourceCount: 0, runtimes: [] })).toBe(true);
  });

  it("accepts the connected runtimes with their kinds", () => {
    expect(
      isBindingSnapshot({
        rows: [],
        runtimeCount: 2,
        sourceCount: 0,
        runtimes: [
          { runtimeId: "browser", kind: "browser" },
          { runtimeId: "server", kind: "server" },
        ],
      }),
    ).toBe(true);
  });

  it("rejects a runtime of an unknown kind, and a snapshot without runtimes", () => {
    expect(
      isBindingSnapshot({ rows: [], runtimeCount: 1, sourceCount: 0, runtimes: [{ runtimeId: "x", kind: "edge" }] }),
    ).toBe(false);
    expect(isBindingSnapshot({ rows: [], runtimeCount: 0, sourceCount: 0 })).toBe(false);
  });

  it("accepts a snapshot with bound rows", () => {
    expect(
      isBindingSnapshot({
        rows: [
          {
            sourceName: "api",
            transport: "http",
            status: "bound",
            runtimeId: "next-server",
            appOrigin: "http://localhost:3000",
          },
        ],
        runtimeCount: 1,
        sourceCount: 1,
        runtimes: [{ runtimeId: "next-server", kind: "server" }],
      }),
    ).toBe(true);
  });

  it("accepts a conflict row with conflicting[] populated", () => {
    expect(
      isBindingSnapshot({
        rows: [
          {
            sourceName: "api",
            transport: "ws",
            status: "conflict",
            conflicting: ["a", "b"],
          },
        ],
        runtimeCount: 0,
        sourceCount: 0,
        runtimes: [],
      }),
    ).toBe(true);
  });

  it("rejects null / non-object roots", () => {
    expect(isBindingSnapshot(null)).toBe(false);
    expect(isBindingSnapshot(undefined)).toBe(false);
    expect(isBindingSnapshot("snapshot")).toBe(false);
    expect(isBindingSnapshot(42)).toBe(false);
    expect(isBindingSnapshot([])).toBe(false);
  });

  it("rejects payloads with prototype-pollution own keys", () => {
    const polluted = JSON.parse(
      '{"rows":[],"runtimeCount":0,"sourceCount":0,"__proto__":{"polluted":true}}',
    );
    expect(isBindingSnapshot(polluted)).toBe(false);
  });

  it("rejects rows with prototype-pollution own keys", () => {
    const polluted = JSON.parse(
      '{"rows":[{"sourceName":"api","transport":"http","status":"orphan","__proto__":{"x":1}}],"runtimeCount":0,"sourceCount":0}',
    );
    expect(isBindingSnapshot(polluted)).toBe(false);
  });

  it("rejects non-finite counts", () => {
    expect(
      isBindingSnapshot({ rows: [], runtimeCount: Number.NaN, sourceCount: 0 }),
    ).toBe(false);
    expect(
      isBindingSnapshot({ rows: [], runtimeCount: 0, sourceCount: Number.POSITIVE_INFINITY }),
    ).toBe(false);
  });

  it("rejects rows with unknown transport", () => {
    expect(
      isBindingSnapshot({
        rows: [{ sourceName: "api", transport: "tcp", status: "bound", runtimeId: "x" }],
        runtimeCount: 1,
        sourceCount: 1,
      }),
    ).toBe(false);
  });

  it("rejects rows with unknown status", () => {
    expect(
      isBindingSnapshot({
        rows: [{ sourceName: "api", transport: "http", status: "draining" }],
        runtimeCount: 0,
        sourceCount: 0,
      }),
    ).toBe(false);
  });

  it("rejects rows with non-string runtimeId", () => {
    expect(
      isBindingSnapshot({
        rows: [{ sourceName: "api", transport: "http", status: "bound", runtimeId: 1 }],
        runtimeCount: 1,
        sourceCount: 1,
      }),
    ).toBe(false);
  });

  it("rejects rows with non-string conflicting[] entries", () => {
    expect(
      isBindingSnapshot({
        rows: [
          {
            sourceName: "api",
            transport: "http",
            status: "conflict",
            conflicting: ["a", 2],
          },
        ],
        runtimeCount: 0,
        sourceCount: 0,
      }),
    ).toBe(false);
  });

  it("rejects empty sourceName", () => {
    expect(
      isBindingSnapshot({
        rows: [{ sourceName: "", transport: "http", status: "orphan" }],
        runtimeCount: 0,
        sourceCount: 0,
      }),
    ).toBe(false);
  });
});

describe("isBindingErrorPayload", () => {
  it("accepts a well-formed conflict payload", () => {
    expect(
      isBindingErrorPayload({
        kind: "conflict",
        details: { sourceName: "api", transport: "http", runtimeIds: ["a", "b"] },
      }),
    ).toBe(true);
  });

  it("rejects unknown kind", () => {
    expect(
      isBindingErrorPayload({
        kind: "unknown",
        details: { sourceName: "api", transport: "http", runtimeIds: [] },
      }),
    ).toBe(false);
  });

  it("rejects payload without details", () => {
    expect(isBindingErrorPayload({ kind: "conflict" })).toBe(false);
  });

  it("rejects details with non-string runtimeIds entries", () => {
    expect(
      isBindingErrorPayload({
        kind: "conflict",
        details: { sourceName: "api", transport: "http", runtimeIds: ["a", 2] },
      }),
    ).toBe(false);
  });

  it("rejects details with unknown transport", () => {
    expect(
      isBindingErrorPayload({
        kind: "conflict",
        details: { sourceName: "api", transport: "tcp", runtimeIds: ["a"] },
      }),
    ).toBe(false);
  });

  it("rejects details with empty sourceName", () => {
    expect(
      isBindingErrorPayload({
        kind: "conflict",
        details: { sourceName: "", transport: "http", runtimeIds: ["a"] },
      }),
    ).toBe(false);
  });

  it("rejects null / non-object roots", () => {
    expect(isBindingErrorPayload(null)).toBe(false);
    expect(isBindingErrorPayload("conflict")).toBe(false);
    expect(isBindingErrorPayload([])).toBe(false);
  });
});

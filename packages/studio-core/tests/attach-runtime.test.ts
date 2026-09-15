/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from "vitest";
import { _resetAnnouncementsForTests } from "../src/runtime/announce-hosting";
import {
  _resetRuntimeHandlesForTests,
  attachRuntime,
} from "../src/runtime/attach-runtime";

afterEach(() => {
  _resetRuntimeHandlesForTests();
  _resetAnnouncementsForTests();
});

describe("attachRuntime (server context)", () => {
  it("reports kind=server when window is undefined", async () => {
    const handle = await attachRuntime("test-server-1");
    expect(handle.kind).toBe("server");
    expect(handle.runtimeId).toBe("test-server-1");
  });

  it("is idempotent — same id returns the same handle", async () => {
    const a = await attachRuntime("test-server-2");
    const b = await attachRuntime("test-server-2");
    expect(a).toBe(b);
  });

  it("detach drops the handle so a fresh attach reconnects", async () => {
    const first = await attachRuntime("test-server-3");
    first.detach();
    const second = await attachRuntime("test-server-3");
    expect(second).not.toBe(first);
  });

  it("detach is safe to call twice", async () => {
    const handle = await attachRuntime("test-server-4");
    handle.detach();
    expect(() => handle.detach()).not.toThrow();
  });

  it("auto-derives a default runtime id when none is passed", async () => {
    const handle = await attachRuntime();
    // Default for the vitest node context (no NEXT_RUNTIME etc.) is "server"
    expect(typeof handle.runtimeId).toBe("string");
    expect(handle.runtimeId.length).toBeGreaterThan(0);
    expect(handle.kind).toBe("server");
  });
});

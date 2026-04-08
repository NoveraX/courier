import { describe, expect, it } from "vitest";
import { trackHealth } from "../src/health";

function createMockRedis(initialStatus = "ready") {
  const listeners = new Map<string, Set<() => void>>();

  return {
    status: initialStatus,

    on(event: string, handler: () => void) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(handler);
      return this;
    },

    off(event: string, handler: () => void) {
      listeners.get(event)?.delete(handler);
      return this;
    },

    emit(event: string) {
      for (const handler of listeners.get(event) ?? []) {
        handler();
      }
    },

    listenerCount(event: string) {
      return listeners.get(event)?.size ?? 0;
    },
  };
}

describe("trackHealth", () => {
  it("returns healthy when Redis status is ready", () => {
    const redis = createMockRedis("ready");
    const { isHealthy } = trackHealth(redis as never);
    expect(isHealthy()).toBe(true);
  });

  it("returns unhealthy when Redis status is not ready", () => {
    const redis = createMockRedis("connecting");
    const { isHealthy } = trackHealth(redis as never);
    expect(isHealthy()).toBe(false);
  });

  it("updates health on ready event", () => {
    const redis = createMockRedis("connecting");
    const { isHealthy } = trackHealth(redis as never);
    expect(isHealthy()).toBe(false);

    redis.emit("ready");
    expect(isHealthy()).toBe(true);
  });

  it("updates health on close event", () => {
    const redis = createMockRedis("ready");
    const { isHealthy } = trackHealth(redis as never);
    expect(isHealthy()).toBe(true);

    redis.emit("close");
    expect(isHealthy()).toBe(false);
  });

  it("updates health on end event", () => {
    const redis = createMockRedis("ready");
    const { isHealthy } = trackHealth(redis as never);
    expect(isHealthy()).toBe(true);

    redis.emit("end");
    expect(isHealthy()).toBe(false);
  });

  it("cleanup removes all event listeners", () => {
    const redis = createMockRedis("ready");
    const { isHealthy, cleanup } = trackHealth(redis as never);

    cleanup();

    // Events should no longer affect health
    redis.emit("close");
    expect(isHealthy()).toBe(true); // State frozen after cleanup
    expect(redis.listenerCount("ready")).toBe(0);
    expect(redis.listenerCount("close")).toBe(0);
    expect(redis.listenerCount("end")).toBe(0);
  });

  it("handles ready → close → ready cycle", () => {
    const redis = createMockRedis("ready");
    const { isHealthy } = trackHealth(redis as never);

    expect(isHealthy()).toBe(true);
    redis.emit("close");
    expect(isHealthy()).toBe(false);
    redis.emit("ready");
    expect(isHealthy()).toBe(true);
  });
});

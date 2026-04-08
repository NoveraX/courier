import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHeartbeat } from "../src/realtime/ws/heartbeat";

describe("createHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls sendPing at each interval", () => {
    const sendPing = vi.fn();
    const onTimeout = vi.fn();
    const hb = createHeartbeat(sendPing, onTimeout, { intervalMs: 1000 });

    hb.start();

    vi.advanceTimersByTime(3000);
    expect(sendPing).toHaveBeenCalledTimes(3);

    hb.stop();
  });

  it("does not fire onTimeout when receivedPong is called in time", () => {
    const sendPing = vi.fn();
    const onTimeout = vi.fn();
    const hb = createHeartbeat(sendPing, onTimeout, {
      intervalMs: 1000,
      timeoutMs: 500,
    });

    hb.start();

    // First ping fires at 1000ms
    vi.advanceTimersByTime(1000);
    expect(sendPing).toHaveBeenCalledTimes(1);

    // Pong received before 500ms timeout
    vi.advanceTimersByTime(200);
    hb.receivedPong();

    vi.advanceTimersByTime(500);
    expect(onTimeout).not.toHaveBeenCalled();

    hb.stop();
  });

  it("fires onTimeout when no pong is received within timeoutMs", () => {
    const sendPing = vi.fn();
    const onTimeout = vi.fn();
    const hb = createHeartbeat(sendPing, onTimeout, {
      intervalMs: 1000,
      timeoutMs: 500,
    });

    hb.start();

    // Ping fires at 1000ms, timeout starts
    vi.advanceTimersByTime(1000);
    expect(sendPing).toHaveBeenCalledTimes(1);

    // No pong — timeout fires at 1500ms
    vi.advanceTimersByTime(500);
    expect(onTimeout).toHaveBeenCalledTimes(1);

    hb.stop();
  });

  it("clears all timers on stop()", () => {
    const sendPing = vi.fn();
    const onTimeout = vi.fn();
    const hb = createHeartbeat(sendPing, onTimeout, {
      intervalMs: 1000,
      timeoutMs: 500,
    });

    hb.start();

    // Let one ping fire and start its timeout
    vi.advanceTimersByTime(1000);
    expect(sendPing).toHaveBeenCalledTimes(1);

    hb.stop();

    // No more pings or timeouts should fire
    vi.advanceTimersByTime(5000);
    expect(sendPing).toHaveBeenCalledTimes(1);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("is idempotent — calling start() twice does not create duplicate intervals", () => {
    const sendPing = vi.fn();
    const onTimeout = vi.fn();
    const hb = createHeartbeat(sendPing, onTimeout, { intervalMs: 1000 });

    hb.start();
    hb.start(); // second call should be a no-op

    vi.advanceTimersByTime(3000);
    // Only 3 pings, not 6
    expect(sendPing).toHaveBeenCalledTimes(3);

    hb.stop();
  });

  it("restarts correctly after stop() then start()", () => {
    const sendPing = vi.fn();
    const onTimeout = vi.fn();
    const hb = createHeartbeat(sendPing, onTimeout, { intervalMs: 1000 });

    hb.start();
    vi.advanceTimersByTime(2000);
    expect(sendPing).toHaveBeenCalledTimes(2);

    hb.stop();
    vi.advanceTimersByTime(3000);
    // No additional pings after stop
    expect(sendPing).toHaveBeenCalledTimes(2);

    hb.start();
    vi.advanceTimersByTime(2000);
    // 2 more pings after restart
    expect(sendPing).toHaveBeenCalledTimes(4);

    hb.stop();
  });
});

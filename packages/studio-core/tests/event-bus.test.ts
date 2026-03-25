import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/event-bus";
import type { AnyStudioEvent, RequestStartEvent } from "../src/events";

function createEvent(overrides: Partial<AnyStudioEvent> = {}): RequestStartEvent {
  return {
    id: "req_1",
    type: "request:start",
    timestamp: 100,
    sessionId: "session_1",
    source: "api",
    group: "users",
    method: "getAll",
    variables: undefined,
    mode: "direct",
    middlewareCount: 0,
    hasValidation: { variables: false, response: false },
    ...overrides,
  } as RequestStartEvent;
}

describe("EventBus", () => {
  it("delivers events to global listeners", () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on(listener);

    const event = createEvent();
    bus.emit(event);

    expect(listener).toHaveBeenCalledWith(event);
  });

  it("delivers events to type-specific listeners", () => {
    const bus = new EventBus();
    const startListener = vi.fn();
    const endListener = vi.fn();

    bus.on("request:start", startListener);
    bus.on("request:end", endListener);

    bus.emit(createEvent());

    expect(startListener).toHaveBeenCalledTimes(1);
    expect(endListener).not.toHaveBeenCalled();
  });

  it("delivers to both global and type-specific listeners", () => {
    const bus = new EventBus();
    const global = vi.fn();
    const typed = vi.fn();

    bus.on(global);
    bus.on("request:start", typed);

    bus.emit(createEvent());

    expect(global).toHaveBeenCalledTimes(1);
    expect(typed).toHaveBeenCalledTimes(1);
  });

  it("buffers events before a global listener connects", () => {
    const bus = new EventBus();
    const e1 = createEvent({ id: "r1" });
    const e2 = createEvent({ id: "r2" });

    bus.emit(e1);
    bus.emit(e2);

    expect(bus.getBuffer()).toHaveLength(2);

    // Connect listener — should receive buffered events
    const listener = vi.fn();
    bus.on(listener);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, e1);
    expect(listener).toHaveBeenNthCalledWith(2, e2);
    expect(bus.getBuffer()).toHaveLength(0);
  });

  it("delivers type-specific events even while buffering", () => {
    const bus = new EventBus();
    const typed = vi.fn();
    bus.on("request:start", typed);

    bus.emit(createEvent());

    expect(typed).toHaveBeenCalledTimes(1);
    // Still buffering for global listeners
    expect(bus.getBuffer()).toHaveLength(1);
  });

  it("respects maxBufferSize", () => {
    const bus = new EventBus({ maxBufferSize: 2 });

    bus.emit(createEvent({ id: "r1" }));
    bus.emit(createEvent({ id: "r2" }));
    bus.emit(createEvent({ id: "r3" }));

    expect(bus.getBuffer()).toHaveLength(2);
  });

  it("returns unsubscribe function for global listeners", () => {
    const bus = new EventBus();
    const listener = vi.fn();
    const unsub = bus.on(listener);

    bus.emit(createEvent());
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    bus.emit(createEvent());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("returns unsubscribe function for type-specific listeners", () => {
    const bus = new EventBus();
    const listener = vi.fn();
    const unsub = bus.on("request:start", listener);

    bus.emit(createEvent());
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    bus.emit(createEvent());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("clears all listeners and buffer", () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.on(listener);

    bus.emit(createEvent());
    expect(listener).toHaveBeenCalledTimes(1);

    bus.clear();
    bus.emit(createEvent());
    // After clear, buffer mode is re-enabled — event goes to buffer, not listener
    expect(listener).toHaveBeenCalledTimes(1);
    expect(bus.getBuffer()).toHaveLength(1);
  });
});

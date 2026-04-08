import { describe, expect, it, vi } from "vitest";
import { createTopicRegistry } from "../src/realtime/ws/ws-topics";

describe("createTopicRegistry", () => {
  it("dispatches to subscribed handler", () => {
    const registry = createTopicRegistry();
    const handler = vi.fn();
    registry.add("chat:room", handler);

    registry.dispatch("chat:room", { text: "hello" });

    expect(handler).toHaveBeenCalledWith({ text: "hello" });
  });

  it("dispatches to multiple handlers on same topic", () => {
    const registry = createTopicRegistry();
    const h1 = vi.fn();
    const h2 = vi.fn();
    registry.add("chat:room", h1);
    registry.add("chat:room", h2);

    registry.dispatch("chat:room", "msg");

    expect(h1).toHaveBeenCalledWith("msg");
    expect(h2).toHaveBeenCalledWith("msg");
  });

  it("does not dispatch to unsubscribed handler", () => {
    const registry = createTopicRegistry();
    const handler = vi.fn();
    const unsub = registry.add("chat:room", handler);

    unsub();
    registry.dispatch("chat:room", "msg");

    expect(handler).not.toHaveBeenCalled();
  });

  it("does nothing when dispatching to unknown topic", () => {
    const registry = createTopicRegistry();
    // Should not throw
    registry.dispatch("unknown", "data");
  });

  it("returns subscribed topics", () => {
    const registry = createTopicRegistry();
    registry.add("a", vi.fn());
    registry.add("b", vi.fn());

    expect(registry.topics()).toEqual(["a", "b"]);
  });

  it("removes topic from list when last handler unsubscribes", () => {
    const registry = createTopicRegistry();
    const unsub = registry.add("a", vi.fn());
    unsub();

    expect(registry.topics()).toEqual([]);
  });

  it("clear removes all subscriptions", () => {
    const registry = createTopicRegistry();
    const handler = vi.fn();
    registry.add("a", handler);
    registry.add("b", vi.fn());

    registry.clear();
    registry.dispatch("a", "msg");

    expect(handler).not.toHaveBeenCalled();
    expect(registry.topics()).toEqual([]);
  });
});

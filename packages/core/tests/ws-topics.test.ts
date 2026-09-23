import { describe, expect, it, vi } from "vitest";

import { ForbiddenError, RealtimeError } from "../src/realtime/errors";
import { createTopicRegistry } from "../src/realtime/ws/ws-topics";
import type { TopicSubscriber } from "../src/realtime/ws/ws-types";

function subscriber() {
  return {
    data: vi.fn<(payload: unknown) => void>(),
    error: vi.fn<(error: RealtimeError) => void>(),
    end: vi.fn<(error: RealtimeError | undefined) => void>(),
  } satisfies TopicSubscriber;
}

describe("createTopicRegistry", () => {
  it("dispatches to subscribed handler", () => {
    const registry = createTopicRegistry();
    const s = subscriber();
    registry.add("chat:room", s);

    registry.dispatch("chat:room", { text: "hello" });

    expect(s.data).toHaveBeenCalledWith({ text: "hello" });
  });

  it("dispatches to multiple handlers on same topic", () => {
    const registry = createTopicRegistry();
    const s1 = subscriber();
    const s2 = subscriber();
    registry.add("chat:room", s1);
    registry.add("chat:room", s2);

    registry.dispatch("chat:room", "msg");

    expect(s1.data).toHaveBeenCalledWith("msg");
    expect(s2.data).toHaveBeenCalledWith("msg");
  });

  it("does not dispatch to unsubscribed handler", () => {
    const registry = createTopicRegistry();
    const s = subscriber();
    const remove = registry.add("chat:room", s);

    remove();
    registry.dispatch("chat:room", "msg");

    expect(s.data).not.toHaveBeenCalled();
  });

  it("does nothing when dispatching to unknown topic", () => {
    const registry = createTopicRegistry();

    expect(() => registry.dispatch("unknown", "data")).not.toThrow();
  });

  it("returns subscribed topics", () => {
    const registry = createTopicRegistry();
    registry.add("a", subscriber());
    registry.add("b", subscriber());

    expect(registry.topics()).toEqual(["a", "b"]);
  });

  it("answers true only when the topic's last subscriber leaves", () => {
    const registry = createTopicRegistry();
    const removeFirst = registry.add("a", subscriber());
    const removeSecond = registry.add("a", subscriber());

    expect(removeFirst()).toBe(false);
    expect(registry.has("a")).toBe(true);
    expect(removeSecond()).toBe(true);
    expect(registry.topics()).toEqual([]);
  });

  it("tells subscribers of an error on their topic without ending it", () => {
    const registry = createTopicRegistry();
    const s = subscriber();
    registry.add("room", s);
    const error = new RealtimeError(4422, "Invalid message payload");

    registry.fail("room", error);
    registry.dispatch("room", "after");

    expect(s.error).toHaveBeenCalledWith(error);
    expect(s.end).not.toHaveBeenCalled();
    expect(s.data).toHaveBeenCalledWith("after");
  });

  it("ends a topic for its subscribers and forgets it, so a reconnect does not renew it", () => {
    const registry = createTopicRegistry();
    const s = subscriber();
    registry.add("room", s, { id: 1 });
    const error = new ForbiddenError("Not a member");

    registry.end("room", error);

    expect(s.end).toHaveBeenCalledWith(error);
    expect(registry.entries()).toEqual([]);
  });

  it("does not let an ended subscriber's removal forget a renewed topic", () => {
    const registry = createTopicRegistry();
    const removeOld = registry.add("room", subscriber());
    registry.end("room", undefined);
    registry.add("room", subscriber());

    expect(removeOld()).toBe(false);
    expect(registry.has("room")).toBe(true);
  });

  it("ends every topic at once", () => {
    const registry = createTopicRegistry();
    const a = subscriber();
    const b = subscriber();
    registry.add("a", a);
    registry.add("b", b);

    registry.endAll(undefined);

    expect(a.end).toHaveBeenCalledWith(undefined);
    expect(b.end).toHaveBeenCalledWith(undefined);
    expect(registry.topics()).toEqual([]);
  });
});

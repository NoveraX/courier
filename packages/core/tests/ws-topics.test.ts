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
    const membership = registry.add("chat:room", s);

    membership.leave();
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

  it("answers the topic to unsubscribe from only when its last subscriber leaves", () => {
    const registry = createTopicRegistry();
    const first = registry.add("a", subscriber());
    const second = registry.add("a", subscriber());

    expect(first.leave()).toBeUndefined();
    expect(registry.has("a")).toBe(true);
    expect(second.leave()).toBe("a");
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
    const old = registry.add("room", subscriber());
    registry.end("room", undefined);
    registry.add("room", subscriber());

    expect(old.leave()).toBeUndefined();
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

describe("a subscription the server renamed", () => {
  it("receives what comes on the server's topic and answers to both names", () => {
    const registry = createTopicRegistry();
    const s = subscriber();
    registry.add("room#asked", s);

    registry.rename("room#asked", "room#served");
    registry.dispatch("room#served", "hello");

    expect(s.data).toHaveBeenCalledWith("hello");
    expect(registry.serverTopic("room#asked")).toBe("room#served");
    expect(registry.topics()).toEqual(["room#served"]);
    expect(registry.entries()).toEqual([
      { qualifiedTopic: "room#served", baseTopic: "room#asked", variables: undefined },
    ]);
  });

  it("is joined by a later subscriber asking for the old name", () => {
    const registry = createTopicRegistry();
    const first = registry.add("room#asked", subscriber());
    registry.rename("room#asked", "room#served");

    const second = registry.add("room#asked", subscriber());

    expect(second.created).toBe(false);
    expect(first.leave()).toBeUndefined();
    expect(second.leave()).toBe("room#served");
    expect(registry.has("room#asked")).toBe(false);
  });

  it("merges into a subscription already on the server's topic", () => {
    const registry = createTopicRegistry();
    const onServed = subscriber();
    const onAsked = subscriber();
    const served = registry.add("room#served", onServed);
    const asked = registry.add("room#asked", onAsked);

    registry.rename("room#asked", "room#served");
    registry.dispatch("room#served", "both");

    expect(onServed.data).toHaveBeenCalledWith("both");
    expect(onAsked.data).toHaveBeenCalledWith("both");
    expect(asked.leave()).toBeUndefined();
    expect(served.leave()).toBe("room#served");
  });

  it("ends for its subscribers when the server refuses it under the name asked for", () => {
    const registry = createTopicRegistry();
    const s = subscriber();
    registry.add("room#asked", s);
    registry.rename("room#asked", "room#served");
    const error = new ForbiddenError("Not a member");

    registry.end("room#asked", error);

    expect(s.end).toHaveBeenCalledWith(error);
    expect(registry.has("room#served")).toBe(false);
  });
});

describe("messages held for an unconfirmed subscription", () => {
  it("are held until the subscribe is confirmed, then handed over in order", () => {
    const registry = createTopicRegistry();
    registry.add("room", subscriber());
    const id = registry.expect("room");

    expect(registry.hold("room", { payload: 1 })).toBe("held");
    expect(registry.hold("room", { payload: 2 })).toBe("held");
    expect(registry.confirm("room", id)).toEqual({
      topic: "room",
      held: [{ payload: 1 }, { payload: 2 }],
    });
    expect(registry.hold("room", { payload: 3 })).toBe("open");
  });

  it("are handed over under the topic the server renamed the subscription to", () => {
    const registry = createTopicRegistry();
    registry.add("room#asked", subscriber());
    const id = registry.expect("room#asked");
    registry.hold("room#asked", { payload: "early" });

    registry.rename("room#asked", "room#served");

    expect(registry.confirm("room#served", id)).toEqual({
      topic: "room#served",
      held: [{ payload: "early" }],
    });
  });

  it("wait again once the socket closes", () => {
    const registry = createTopicRegistry();
    registry.add("room", subscriber());
    registry.confirm("room", registry.expect("room"));

    registry.unconfirmAll();

    expect(registry.hold("room", { payload: "while away" })).toBe("held");
  });

  it("are not released by the answer to a subscribe that another replaced", () => {
    const registry = createTopicRegistry();
    registry.add("room", subscriber());
    const stale = registry.expect("room");
    const current = registry.expect("room");
    registry.hold("room", { payload: "early" });

    expect(registry.confirm("room", stale)).toEqual({ topic: "room", held: [] });
    expect(registry.confirm("room", current)?.held).toEqual([{ payload: "early" }]);
  });

  it("are dropped beyond the queue's limit and reported when the subscription ends", () => {
    const onDrop = vi.fn<(topic: string, count: number) => void>();
    const registry = createTopicRegistry({ messageQueue: { maxCount: 1 }, onDrop });
    const membership = registry.add("room", subscriber());
    registry.expect("room");

    expect(registry.hold("room", { payload: 1 })).toBe("held");
    expect(registry.hold("room", { payload: 2 })).toBe("dropped");
    membership.leave();

    expect(onDrop).toHaveBeenCalledWith("room", 1);
  });

  it("go out at once on a topic nobody subscribed to", () => {
    const registry = createTopicRegistry();

    expect(registry.hold("room", { payload: 1 })).toBe("open");
  });

  it("answer a confirmation for a subscription that is gone with nothing", () => {
    const registry = createTopicRegistry();
    const membership = registry.add("room", subscriber());
    const id = registry.expect("room");
    membership.leave();

    expect(registry.confirm("room", id)).toBeUndefined();
  });
});

import { describe, expect, it, vi } from "vitest";

import { ForbiddenError, RealtimeError } from "../src/realtime/errors";
import { createTopicRegistry } from "../src/realtime/ws/ws-topics";
import type { TopicSubscriber } from "../src/realtime/ws/ws-types";

function subscriber() {
  return {
    data: vi.fn<(payload: unknown) => void>(),
    error: vi.fn<(error: RealtimeError) => void>(),
    wait: vi.fn<(error: RealtimeError | undefined) => void>(),
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
    expect(registry.subscriptionOf("a")).toBeDefined();
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
    expect(registry.subscriptionOf("room")).toBeDefined();
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
    expect(registry.subscriptionOf("room#asked")?.topic).toBe("room#served");
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
    expect(registry.subscriptionOf("room#asked")).toBeUndefined();
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
    expect(registry.subscriptionOf("room#served")).toBeUndefined();
  });
});

describe("the confirmation of a subscription", () => {
  it("answers with the subscription the subscribe was for, which is confirmed from then on", () => {
    const registry = createTopicRegistry();
    registry.add("room", subscriber());
    const id = registry.expect("room");

    const confirmed = registry.confirm("room", id);

    expect(confirmed).toBe(registry.subscriptionOf("room"));
    expect(registry.subscriptionOf("room")?.confirmed).toBe(true);
  });

  it("answers under the topic the server renamed the subscription to", () => {
    const registry = createTopicRegistry();
    registry.add("room#asked", subscriber());
    const id = registry.expect("room#asked");

    registry.rename("room#asked", "room#served");

    expect(registry.confirm("room#served", id)).toMatchObject({
      topic: "room#served",
      confirmed: true,
    });
  });

  it("is let go of once the socket closes, each subscriber hearing what was lost with it", () => {
    const registry = createTopicRegistry();
    const s = subscriber();
    registry.add("room", s);
    registry.confirm("room", registry.expect("room"));
    const lost = new RealtimeError(1009, "A message was too large for the server");

    registry.unconfirmAll(lost);

    expect(registry.subscriptionOf("room")?.confirmed).toBe(false);
    expect(s.wait).toHaveBeenCalledWith(lost);
  });

  it("is stale when it answers a subscribe that another replaced", () => {
    const registry = createTopicRegistry();
    registry.add("room", subscriber());
    const stale = registry.expect("room");
    const current = registry.expect("room");

    expect(registry.confirm("room", stale)).toBe("stale");
    expect(registry.confirm("room", current)).toBe(registry.subscriptionOf("room"));
  });

  it("answers nothing for a subscription that is gone", () => {
    const registry = createTopicRegistry();
    const membership = registry.add("room", subscriber());
    const id = registry.expect("room");
    membership.leave();

    expect(registry.confirm("room", id)).toBeUndefined();
  });
});

describe("a subscription let go of or merged", () => {
  it("is told to whoever keeps what it was to send, when it ends or its last subscriber leaves", () => {
    const onForget = vi.fn<(subscription: { topic: string }) => void>();
    const registry = createTopicRegistry({ onForget });
    const membership = registry.add("room", subscriber());
    registry.add("feed", subscriber());

    membership.leave();
    registry.end("feed", undefined);

    expect(onForget.mock.calls.map(([s]) => s.topic)).toEqual(["room", "feed"]);
  });

  it("hands what it was to send to the subscription the server took it for", () => {
    const onMerge = vi.fn();
    const registry = createTopicRegistry({ onMerge });
    registry.add("room#served", subscriber());
    registry.add("room#asked", subscriber());
    const asked = registry.subscriptionOf("room#asked");

    registry.rename("room#asked", "room#served");

    expect(onMerge).toHaveBeenCalledWith(asked, registry.subscriptionOf("room#served"));
  });
});

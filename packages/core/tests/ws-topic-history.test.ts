/**
 * A topic history's bounds: events a topic, age, and bytes in all — the
 * oldest event of any topic let go first — and what a subscription missed
 * is sent back only when every event of it is kept. The topics held
 * without a subscriber are bounded too.
 */
import { describe, expect, it, vi } from "vitest";

import { createTopicHistory } from "../src/adapter/ws-topic-history";
import { createTopicRetention } from "../src/adapter/ws-topic-retention";

const frame = (seq: number) => `{"type":"data","topic":"t","seq":${seq}}`;

describe("createTopicHistory", () => {
  it("sends back every event after a position, and nothing once one of them is let go", () => {
    const history = createTopicHistory({ maxEvents: 3 });
    for (let seq = 1; seq <= 5; seq++) history.record("t", seq, frame(seq));

    expect(history.between("t", 2, 5)).toEqual([frame(3), frame(4), frame(5)]);
    expect(history.between("t", 1, 5)).toBeUndefined();
    expect(history.between("t", 5, 5)).toEqual([]);
  });

  it("lets an event go once it is older than maxAgeMs", () => {
    let now = 0;
    const history = createTopicHistory({ maxAgeMs: 1_000 }, () => now);
    history.record("t", 1, frame(1));
    now = 600;
    history.record("t", 2, frame(2));

    now = 1_200;
    expect(history.between("t", 0, 2)).toBeUndefined();
    expect(history.between("t", 1, 2)).toEqual([frame(2)]);
  });

  it("keeps at most maxBytes in all, letting the oldest of any topic go first", () => {
    const size = frame(1).length;
    const history = createTopicHistory({ maxBytes: size * 2 });
    history.record("a", 1, frame(1));
    history.record("b", 1, frame(1));
    history.record("b", 2, frame(2));

    expect(history.between("a", 0, 1)).toBeUndefined();
    expect(history.between("b", 0, 2)).toEqual([frame(1), frame(2)]);
  });

  it("forgets a topic's events", () => {
    const history = createTopicHistory({});
    history.record("t", 1, frame(1));

    history.drop("t");

    expect(history.between("t", 0, 1)).toBeUndefined();
  });
});

describe("createTopicRetention", () => {
  it("holds a topic for maxAgeMs, then lets it go", () => {
    vi.useFakeTimers();
    const letGo = vi.fn();
    const retention = createTopicRetention(createTopicHistory({ maxAgeMs: 100 }).limits, letGo);

    expect(retention.hold("t")).toBe(true);
    vi.advanceTimersByTime(99);
    expect(letGo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(letGo).toHaveBeenCalledWith("t");
    vi.useRealTimers();
  });

  it("holds at most maxTopics, letting the one held longest go first", () => {
    const letGo = vi.fn();
    const retention = createTopicRetention(createTopicHistory({ maxTopics: 2 }).limits, letGo);
    retention.hold("a");
    retention.hold("b");

    retention.hold("c");

    expect(letGo).toHaveBeenCalledExactlyOnceWith("a");
    expect(retention.reclaim("b")).toBe(true);
    expect(retention.reclaim("a")).toBe(false);
    retention.destroy();
  });

  it("holds nothing for a handler that keeps no history", () => {
    expect(createTopicRetention(undefined, vi.fn()).hold("t")).toBe(false);
  });
});

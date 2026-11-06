/**
 * Acting on a message once: by its id, near the time it says it was sent,
 * within a bound on the ids remembered.
 */
import { describe, expect, it } from "vitest";

import { createReplayGuard } from "../src/adapter/replay-guard";
import { seededIntegers } from "./helpers/seeded-random";

const WINDOW = 60_000;

function clocked(capacity = 100) {
  let now = 1_700_000_000_000;
  const guard = createReplayGuard({ windowMs: WINDOW, capacity, now: () => now });
  return {
    guard,
    get now() {
      return now;
    },
    advance(ms: number) {
      now += ms;
    },
  };
}

describe("createReplayGuard", () => {
  it("takes a message once, and refuses its id again", () => {
    const clock = clocked();

    expect(clock.guard.admit("m1", clock.now)).toBe("fresh");
    expect(clock.guard.admit("m1", clock.now)).toBe("replayed");
    expect(clock.guard.admit("m2", clock.now)).toBe("fresh");
  });

  it("takes a message sent within its window either way, and refuses one sent at its edge or beyond", () => {
    const clock = clocked();

    expect(clock.guard.admit("late", clock.now - WINDOW + 1)).toBe("fresh");
    expect(clock.guard.admit("early", clock.now + WINDOW - 1)).toBe("fresh");
    expect(clock.guard.admit("stale", clock.now - WINDOW)).toBe("stale");
    expect(clock.guard.admit("ahead", clock.now + WINDOW)).toBe("early");
  });

  it("forgets an id only once any message carrying it is outside the window", () => {
    const clock = clocked();
    const sentAt = clock.now + WINDOW - 1;
    clock.guard.admit("m1", sentAt);

    clock.advance(2 * WINDOW - 2);
    expect(clock.guard.admit("m1", sentAt)).toBe("replayed");

    clock.advance(2);
    expect(clock.guard.admit("m1", sentAt)).toBe("stale");
    expect(clock.guard.size).toBe(0);
  });

  it("remembers at most its capacity, forgetting the oldest first", () => {
    const clock = clocked(3);
    for (const id of ["m1", "m2", "m3", "m4"]) clock.guard.admit(id, clock.now);

    expect(clock.guard.size).toBe(3);
    expect(clock.guard.admit("m4", clock.now)).toBe("replayed");
  });

  it("refuses an id it forgot for room as stale while its message is in the window, and opens no other", () => {
    const clock = clocked(3);
    const sentAt = clock.now;
    for (const id of ["m1", "m2", "m3", "m4"]) clock.guard.admit(id, sentAt);
    clock.advance(5_000);

    expect(clock.guard.admit("m1", sentAt)).toBe("stale");
    expect(clock.guard.admit("m2", sentAt)).toBe("replayed");
    expect(clock.guard.size).toBe(3);
  });

  it("takes no id twice, however its capacity overflows and its messages are replayed", () => {
    const next = seededIntegers(0x9e37);
    for (let run = 0; run < 50; run++) {
      const clock = clocked(1 + next(8));
      const sent = new Map<string, number>();
      const taken = new Map<string, number>();
      for (let step = 0; step < 400; step++) {
        clock.advance(next(500));
        const replay = sent.size > 0 && next(2) === 0;
        const id = replay ? `m${next(sent.size)}` : `m${sent.size}`;
        const at = sent.get(id) ?? clock.now - next(WINDOW);
        sent.set(id, at);
        if (clock.guard.admit(id, at) === "fresh") taken.set(id, (taken.get(id) ?? 0) + 1);
      }
      expect([...taken.values()].every((times) => times === 1)).toBe(true);
    }
  });

  it("goes on taking messages sent after the ones it forgot for room", () => {
    const clock = clocked(3);
    for (const id of ["m1", "m2", "m3", "m4"]) clock.guard.admit(id, clock.now);
    clock.advance(1);

    expect(clock.guard.admit("m5", clock.now)).toBe("fresh");
  });
});

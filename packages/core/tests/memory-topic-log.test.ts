/**
 * The log a memory bus keeps: one sequence a topic, the same for every
 * replica; a read sends back every event of a range or none — for another
 * epoch, or an event no longer kept — and at most `maxTopics` are kept, the
 * one published to longest ago let go first, to begin anew in another
 * epoch. A stopped replica appends nothing.
 */
import { describe, expect, it } from "vitest";

import type { LoggedPosition, TopicLog } from "../src/realtime/adapters";
import { createMemoryBus } from "../src/realtime/memory-bus";

function logOf(options: { maxEvents?: number; maxTopics?: number } = {}) {
  const bus = createMemoryBus({ log: options });
  const replica = bus.replica("a");
  return { log: replica.log as TopicLog, replica, other: bus.replica("b").log as TopicLog };
}

describe("a memory bus's log", () => {
  it("numbers each topic's events in one sequence, whichever replica appends", async () => {
    const { log, other } = logOf();
    await log.append("t", "one");
    await other.append("t", "two");
    await other.append("u", "elsewhere");

    const { epoch } = await log.position("t");

    expect(await other.position("t")).toEqual({ seq: 2, epoch });
    expect(await log.read("t", { seq: 0, epoch }, 2)).toMatchObject([
      { seq: 1, payload: "one" },
      { seq: 2, payload: "two" },
    ]);
    expect((await log.position("u")).seq).toBe(1);
  });

  it("sends back a range, nothing past it, and none for another epoch or what it let go", async () => {
    const { log } = logOf({ maxEvents: 2 });
    for (const text of ["one", "two", "three"]) await log.append("t", text);
    const { epoch } = await log.position("t");

    expect(await log.read("t", { seq: 1, epoch }, 2)).toMatchObject([{ seq: 2 }]);
    expect(await log.read("t", { seq: 3, epoch }, 3)).toEqual([]);
    expect(await log.read("t", { seq: 0, epoch }, 3)).toBeUndefined();
    expect(await log.read("t", { seq: 1, epoch: `${epoch}x` }, 3)).toBeUndefined();
    expect(await log.read("t", { seq: 1, epoch }, 4)).toBeUndefined();
  });

  it("keeps maxTopics, letting the one published to longest ago begin anew", async () => {
    const { log } = logOf({ maxTopics: 2 });
    await log.append("a", "1");
    await log.append("b", "1");
    await log.append("a", "2");
    const { epoch } = await log.position("b");

    await log.append("c", "1");

    expect(await log.position("a")).toMatchObject({ seq: 2 });
    const renewed = await log.position("b");
    expect(renewed.seq).toBe(0);
    expect(renewed.epoch).not.toBe(epoch);
  });

  it("delivers each event with where it stands, to the replica that appended it too", async () => {
    const { log, replica } = logOf();
    const heard: Array<[unknown, LoggedPosition | undefined]> = [];
    await replica.subscribe("t", (message, logged) => heard.push([message, logged]));

    await log.append("t", "one", "conn-1");

    await expect.poll(() => heard).toHaveLength(1);
    expect(heard[0]).toEqual(["one", { seq: 1, epoch: expect.any(String), exclude: "conn-1" }]);
  });

  it("refuses an append once its replica is stopped", async () => {
    const { log, replica } = logOf();
    await replica.disconnect();

    await expect(log.append("t", "late")).rejects.toThrow();
  });
});

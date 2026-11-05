/**
 * What a Redis topic log takes back from Redis, checked before it is
 * trusted: an envelope whose position is not whole is no envelope; a
 * damaged position throws; a read with a damaged entry, or a gap, sends
 * back nothing; a script Redis forgot is sent again; and an append is
 * sent whole each time, so two never swap places. No Redis is needed.
 */
import type { TopicLog } from "@noverax/courier/realtime";
import type { Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";

import { createRedisTopicLog } from "../src/redis-topic-log";
import { envelopeOf } from "../src/wire-guards";

/** A log on a publisher whose scripts answer `reply`; what it was asked is recorded. */
function logAnswering(reply: unknown, noscript = false) {
  const evalsha = vi.fn(async () => {
    if (noscript) throw new Error("NOSCRIPT No matching script. Please use EVAL.");
    return reply;
  });
  const evaluate = vi.fn(async () => reply);
  const publisher = { evalsha, eval: evaluate } as unknown as Redis;
  const dispatch = vi.fn(async (command: () => Promise<unknown>) => {
    await command();
  });
  const log: TopicLog = createRedisTopicLog(
    { publisher, prefix: "p:", origin: "replica-a", dispatch },
    {},
  );
  return { log, evalsha, evaluate, dispatch };
}

const entry = (seq: number, payload: string, exclude = "") => [
  `${seq}-0`,
  ["p", payload, "x", exclude],
];

describe("a logged envelope", () => {
  it.each([
    ['{"origin":"a","payload":1,"logged":{"seq":3,"epoch":"e1"}}', true],
    ['{"origin":"a","payload":1,"logged":{"seq":3,"epoch":"e1","exclude":"c1"}}', true],
    ['{"origin":"a","payload":1,"logged":{"seq":0,"epoch":"e1"}}', false],
    ['{"origin":"a","payload":1,"logged":{"seq":1.5,"epoch":"e1"}}', false],
    ['{"origin":"a","payload":1,"logged":{"seq":3,"epoch":""}}', false],
    [`{"origin":"a","payload":1,"logged":{"seq":3,"epoch":"${"e".repeat(65)}"}}`, false],
    ['{"origin":"a","payload":1,"logged":{"seq":3,"epoch":"e1","exclude":7}}', false],
    ['{"origin":"a","payload":1,"logged":"3"}', false],
  ])("is taken only with a whole position: %s", (raw, taken) => {
    expect(envelopeOf(raw) !== undefined).toBe(taken);
  });
});

describe("what a Redis topic log takes back", () => {
  it("reads a position, 0 for a sequence with no event yet", async () => {
    expect(await logAnswering([null, "e1"]).log.position("t")).toEqual({ seq: 0, epoch: "e1" });
    expect(await logAnswering(["7", "e1"]).log.position("t")).toEqual({ seq: 7, epoch: "e1" });
  });

  it.each([[["x", "e1"]], [["7", null]], ["7"]])(
    "throws on a damaged position: %j",
    async (reply) => {
      await expect(logAnswering(reply).log.position("t")).rejects.toThrow(/damaged/);
    },
  );

  it("reads a range, each event with the connection it left out", async () => {
    const { log } = logAnswering([entry(4, '{"text":"hi"}', "c1"), entry(5, "2")]);

    expect(await log.read("t", { seq: 3, epoch: "e1" }, 5)).toEqual([
      { seq: 4, epoch: "e1", payload: { text: "hi" }, exclude: "c1" },
      { seq: 5, epoch: "e1", payload: 2 },
    ]);
  });

  it.each([
    ["another epoch", null],
    ["a gap", [entry(4, "1"), entry(6, "3")]],
    ["one too few", [entry(5, "2")]],
    ["a damaged payload", [entry(4, "{"), entry(5, "2")]],
    ["a damaged id", [["four", ["p", "1"]], entry(5, "2")]],
  ])("sends back nothing for %s", async (_case, reply) => {
    expect(await logAnswering(reply).log.read("t", { seq: 3, epoch: "e1" }, 5)).toBeUndefined();
  });

  it("asks nothing for a range longer than it keeps", async () => {
    const { log, evalsha } = logAnswering([]);

    expect(await log.read("t", { seq: 0, epoch: "e1" }, 101)).toBeUndefined();
    expect(evalsha).not.toHaveBeenCalled();
  });

  it("sends a script Redis forgot again, by its source", async () => {
    const { log, evaluate } = logAnswering(["2", "e1"], true);

    expect(await log.position("t")).toEqual({ seq: 2, epoch: "e1" });
    expect(evaluate).toHaveBeenCalledOnce();
  });

  it("sends an append whole, on keys of one hash slot, through the adapter's queue", async () => {
    const { log, evalsha, evaluate, dispatch } = logAnswering(1);

    await log.append('api.chat.room#{"room":"a"}', { text: "hi" }, "c1");

    expect(dispatch).toHaveBeenCalledOnce();
    expect(evalsha).not.toHaveBeenCalled();
    const [, keyCount, sequence, events, ...args] = evaluate.mock.calls[0] as unknown as string[];
    expect(keyCount).toBe(2);
    expect(sequence).toMatch(/^p:courier:log:\{[0-9a-f]{40}\}$/);
    expect(events).toBe(`${sequence}:events`);
    expect(args.slice(3)).toEqual([
      'p:api.chat.room#{"room":"a"}',
      expect.stringMatching(/^\{"origin":"replica-a","timestamp":\d+,"payload":$/),
      '{"text":"hi"}',
      ',"exclude":"c1"',
      "c1",
    ]);
  });
});

/**
 * A broadcast's reach, timed apart from the processor time: each broadcast is
 * sent once the last on every transport is in every client's hands and every
 * connection over HTTP holds its stream or poll again, so what is timed is a
 * broadcast, not the queue behind the one before it, however slow the machine.
 */
import { describe, expect, it } from "vitest";

import { timeFanout } from "./transports-fanout.mjs";

const CONNECTIONS = 3;

/*
 * A transport's replica and clients, faked, writing what each was asked to one log. After a
 * broadcast, a replica over HTTP holds none of its connections' requests, then one more each time
 * it is asked, up to `holds`; its clients have every broadcast, and the latency of each timed one,
 * unless `short`. `before` is a latency the clients heard before the rounds began.
 */
function fake(transport, log, { holds = CONNECTIONS, short = 0, before = [] } = {}) {
  let held = CONNECTIONS;
  let heard = [...before];
  return {
    transport,
    n: 5,
    replica: {
      async ask(kind, fields) {
        if (kind === "broadcast") {
          log.push(`broadcast ${transport} ${fields.n}`);
          held = 0;
          if (fields.timed) heard.push(fields.n * 1000);
          return {};
        }
        held = Math.min(holds, held + 1);
        log.push(`asked ${transport}: ${held} held`);
        return {
          stats: {
            http: {
              streaming: transport === "stream" ? held : 0,
              polling: transport === "poll" ? held : 0,
            },
          },
        };
      },
    },
    clients: {
      async awaitEvent(n) {
        log.push(`heard ${transport} ${n}`);
        const latencies = heard;
        heard = [];
        return {
          short,
          missed: 0,
          twice: 0,
          latencies,
          transports: [{ [transport]: CONNECTIONS }],
        };
      },
    },
  };
}

describe("a broadcast's reach", () => {
  it("is timed from a broadcast sent once the last on every transport was in every client's hands and every request over HTTP held again", async () => {
    const log = [];
    const runs = ["websocket", "stream", "poll"].map((transport) => fake(transport, log));

    await timeFanout(runs, { rounds: 2, connections: CONNECTIONS });

    expect(log.filter((line) => line.startsWith("broadcast"))).toEqual([
      "broadcast websocket 6",
      "broadcast stream 6",
      "broadcast poll 6",
      "broadcast websocket 7",
      "broadcast stream 7",
      "broadcast poll 7",
    ]);
    /* No broadcast begins while one before it, on any transport, is still on its way. */
    const unsettled = new Map();
    for (const line of log) {
      const [what, transport] = line.split(" ");
      if (what === "broadcast") {
        expect([...unsettled.keys()], line).toEqual([]);
        unsettled.set(transport, { heard: false, held: transport === "websocket" });
      } else if (unsettled.has(transport.replace(":", ""))) {
        const name = transport.replace(":", "");
        const state = unsettled.get(name);
        if (what === "heard") state.heard = true;
        if (line.endsWith(`${CONNECTIONS} held`)) state.held = true;
        if (state.heard && state.held) unsettled.delete(name);
      }
    }
    expect([...unsettled.keys()]).toEqual([]);
  });

  it("counts the latencies of its own broadcasts alone, not what the clients heard before", async () => {
    const log = [];
    const runs = [fake("websocket", log, { before: [999_000] }), fake("poll", log)];

    const reached = await timeFanout(runs, { rounds: 3, connections: CONNECTIONS });

    expect(reached.get("websocket").latencies).toEqual([6000, 7000, 8000]);
    expect(reached.get("poll").latencies).toEqual([6000, 7000, 8000]);
    expect(reached.get("poll").last).toMatchObject({ short: 0, missed: 0, twice: 0 });
  });

  it("gives up, saying how many held one, when a replica never holds every connection's request again", async () => {
    const runs = [fake("poll", [], { holds: CONNECTIONS - 1 })];

    await expect(
      timeFanout(runs, { rounds: 1, connections: CONNECTIONS, heldMs: 30 }),
    ).rejects.toThrow("2 of 3 connections on poll held a stream or a poll 0.03 s after event 5");
  });

  it("gives up, saying how many, when a broadcast never reaches every client", async () => {
    const runs = [fake("websocket", [], { short: 1 })];

    await expect(timeFanout(runs, { rounds: 1, connections: CONNECTIONS })).rejects.toThrow(
      "1 of 3 connections on websocket never had event 5",
    );
  });
});

/**
 * The events a runtime sends Studio, in batches: everything one turn of the
 * event loop reports leaves together, as one message, after the turn — and
 * nothing a batch carries can close Studio's connection or stop the app.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnyStudioEvent } from "../src/events";
import { type EventBatchesTarget, eventBatches } from "../src/runtime/event-batches";

interface Sent {
  target: EventBatchesTarget;
  batches: AnyStudioEvent[][];
  bytes: number[];
  kept: AnyStudioEvent[];
  connected: { now: boolean };
}

function socket(most = Number.POSITIVE_INFINITY): Sent {
  const sent: Sent = {
    batches: [],
    bytes: [],
    kept: [],
    connected: { now: true },
    target: {
      send(batch) {
        const text = typeof batch === "string" ? batch : new TextDecoder().decode(batch);
        sent.bytes.push(typeof batch === "string" ? batch.length : batch.length);
        sent.batches.push(JSON.parse(text));
      },
      connected: () => sent.connected.now,
      keep: (event) => sent.kept.push(event),
      most: () => most,
    },
  };
  return sent;
}

function started(id: string, extra: Record<string, unknown> = {}): AnyStudioEvent {
  return {
    id,
    type: "request:start",
    sessionId: "app",
    timestamp: 1,
    source: "api",
    group: "users",
    method: "list",
    variables: undefined,
    mode: "direct",
    middlewareCount: 0,
    hasValidation: { variables: false, response: false },
    ...extra,
  } as AnyStudioEvent;
}

const turnOver = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the events of one turn", () => {
  it("leave together, in order, once the turn is over", async () => {
    const sent = socket();
    const batches = eventBatches(sent.target);

    batches.add(started("r1"));
    batches.add(started("r2"));
    batches.add(started("r3"));
    expect(sent.batches).toEqual([]);
    await turnOver();

    expect(sent.batches.map((batch) => batch.map((event) => event.id))).toEqual([
      ["r1", "r2", "r3"],
    ]);
  });

  it("leave at once when flushed, ahead of a message that must follow them", () => {
    const sent = socket();
    const batches = eventBatches(sent.target);

    batches.add(started("r1"));
    batches.flush();

    expect(sent.batches).toHaveLength(1);
  });

  it("are kept to send later when the socket is down as the turn ends", async () => {
    const sent = socket();
    const batches = eventBatches(sent.target);

    batches.add(started("r1"));
    sent.connected.now = false;
    await turnOver();

    expect(sent.batches).toEqual([]);
    expect(sent.kept.map((event) => event.id)).toEqual(["r1"]);
  });
});

describe("a batch larger than one message", () => {
  it("goes as several, each within what Studio takes, in order", async () => {
    const most = 64 * 1024;
    const sent = socket(most);
    const batches = eventBatches(sent.target);
    const note = "n".repeat(2_000);

    for (let i = 0; i < 100; i++) batches.add(started(`r${i}`, { note }));
    await turnOver();

    expect(sent.batches.length).toBeGreaterThan(1);
    expect(Math.max(...sent.bytes)).toBeLessThanOrEqual(most);
    expect(sent.batches.flat().map((event) => event.id)).toEqual(
      Array.from({ length: 100 }, (_, i) => `r${i}`),
    );
  });
});

describe("an event Studio could not take", () => {
  it("is left out, and said once, when it alone is larger than a message", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sent = socket(4 * 1024);
    const batches = eventBatches(sent.target);

    batches.add(started("r1"));
    batches.add(started("huge", { note: "é".repeat(8 * 1024) }));
    batches.add(started("huge-again", { note: "é".repeat(8 * 1024) }));
    batches.add(started("r2"));
    await turnOver();

    expect(sent.batches.flat().map((event) => event.id)).toEqual(["r1", "r2"]);
    expect(warn.mock.calls.flat().join(" ")).toContain("larger than Studio takes");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("is left out, and said, when it is no JSON — and the turn ends without a throw", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sent = socket();
    const batches = eventBatches(sent.target);

    batches.add(started("r1"));
    batches.add(started("bigint", { size: 10n }));
    batches.add(started("r2"));
    await turnOver();

    expect(sent.batches.flat().map((event) => event.id)).toEqual(["r1", "r2"]);
    expect(warn.mock.calls.flat().map(String).join(" ")).toContain("could not be sent to Studio");
  });
});

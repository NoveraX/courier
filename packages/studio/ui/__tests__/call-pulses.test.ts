/**
 * The calls that run along the Explorer's graph: which calls run — each
 * once, as it ends, a cancelled one never — how each is coloured, and how
 * long it runs on its way.
 */
import { describe, expect, it } from "vitest";

import { endedCalls, pulseOf, pulseToneOf } from "@/features/explorer/call-pulses";
import { requestEntry } from "./request-entry-fixture";

const BRANCH = { path: "M0 0 L100 0", length: 560 };

describe("a call on the graph", () => {
  it("runs red when it failed, amber when slow, blue otherwise", () => {
    const timing = (total: number) => ({ total, middleware: 0, fetch: total, validation: 0 });

    expect(pulseToneOf(requestEntry({ status: "error" }), 500)).toBe("err");
    expect(pulseToneOf(requestEntry({ status: "success", timing: timing(800) }), 500)).toBe("warn");
    expect(pulseToneOf(requestEntry({ status: "success", timing: timing(80) }), 500)).toBe("ok");
  });

  it("runs once, as it ends, and not at all when it was cancelled", () => {
    const seen = new Set<string>();
    const pending = requestEntry({ id: "p", status: "pending" });
    const done = requestEntry({ id: "d", status: "success" });
    const cancelled = requestEntry({ id: "a", status: "aborted" });

    expect(endedCalls([pending, done, cancelled], seen).map((r) => r.id)).toEqual(["d"]);
    expect(endedCalls([{ ...pending, status: "success" }, done], seen).map((r) => r.id)).toEqual([
      "p",
    ]);
    expect(endedCalls([done, cancelled], seen)).toEqual([]);
  });

  it("runs the longer the way, within bounds", () => {
    const call = requestEntry({ status: "success" });

    expect(pulseOf(call, BRANCH, 500).duration).toBe(1000);
    expect(pulseOf(call, { ...BRANCH, length: 10 }, 500).duration).toBe(650);
    expect(pulseOf(call, { ...BRANCH, length: 5_000 }, 500).duration).toBe(1500);
    expect(pulseOf(call, BRANCH, 500)).toMatchObject({ id: call.id, path: BRANCH.path });
  });
});

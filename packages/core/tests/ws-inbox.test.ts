/**
 * What a socket sends before its connection is admitted is held for it,
 * bounded twice: by how many frames, and by how much they hold together —
 * a frame larger than a message may be is never taken in at all. Its first
 * frame is read as it comes, before any after it is taken in.
 */
import { describe, expect, it, vi } from "vitest";

import { type HeldCount, holdFrames } from "../src/adapter/ws-inbox";
import { createFakeSocket } from "./helpers/fake-socket";
import { seededIntegers } from "./helpers/seeded-random";

const LIMITS = { frames: 50, size: 4_000, frameSize: 1_000 };

describe("holdFrames, its first frame", () => {
  it("is read as it comes, and once it is refused nothing after it is kept, nor let go of", () => {
    const ws = createFakeSocket();
    const told: HeldCount[] = [];
    const inbox = holdFrames(ws, { ...LIMITS, frames: 2 }, (held) => told.push(held));
    const read: Array<string | undefined> = [];
    inbox.first(1_000, (raw) => {
      read.push(raw);
      return false;
    });

    for (const data of ["first", "a", "b", "c"]) ws.emit("message", { data });

    const routed: string[] = [];
    inbox.open((raw) => routed.push(raw));
    expect(read).toEqual(["first"]);
    expect(told).toEqual([]);
    expect(routed).toEqual([]);
  });

  it("counts among what the socket may send, and is not held with what follows it", () => {
    const ws = createFakeSocket();
    const told: HeldCount[] = [];
    const inbox = holdFrames(ws, { ...LIMITS, frames: 3 }, (held) => told.push(held));
    inbox.first(1_000, () => true);

    for (const data of ["auth", "a", "b"]) ws.emit("message", { data });
    expect(told).toEqual([]);
    ws.emit("message", { data: "c" });

    expect(told).toEqual([{ frames: 3, size: 6 }]);
  });

  it("is read at once when it came before it was asked for", () => {
    const ws = createFakeSocket();
    const inbox = holdFrames(ws, LIMITS, () => {});
    ws.emit("message", { data: "auth" });
    ws.emit("message", { data: "a" });
    const read: Array<string | undefined> = [];

    inbox.first(1_000, (raw) => {
      read.push(raw);
      return true;
    });

    const routed: string[] = [];
    inbox.open((raw) => routed.push(raw));
    expect(read).toEqual(["auth"]);
    expect(routed).toEqual(["a"]);
  });

  it("is read as none when it does not come in time, or the socket closes first", () => {
    vi.useFakeTimers();
    try {
      const late = holdFrames(createFakeSocket(), LIMITS, () => {});
      const closing = createFakeSocket();
      const closed = holdFrames(closing, LIMITS, () => {});
      const read: Array<[string, string | undefined]> = [];
      late.first(3_000, (raw) => read.push(["late", raw]) > 0);
      closed.first(3_000, (raw) => read.push(["closed", raw]) > 0);

      closing.emit("close", { code: 1006 });
      vi.advanceTimersByTime(3_000);

      expect(read).toEqual([
        ["closed", undefined],
        ["late", undefined],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("holdFrames", () => {
  it("lets go of a socket once what it holds would grow past its size, saying how much it held", () => {
    const ws = createFakeSocket();
    const told: Array<{ frames: number; size: number }> = [];
    holdFrames(ws, LIMITS, (held) => told.push(held));

    for (let i = 0; i < 6; i++) ws.emit("message", { data: "x".repeat(900) });

    expect(told).toEqual([{ frames: 4, size: 3_600 }]);
  });

  it("never takes in a frame larger than a message may be", () => {
    const ws = createFakeSocket();
    const told: Array<{ frames: number; size: number }> = [];
    const inbox = holdFrames(ws, LIMITS, (held) => told.push(held));

    ws.emit("message", { data: "a" });
    ws.emit("message", { data: Buffer.alloc(1_001) });

    const routed: string[] = [];
    inbox.open((raw) => routed.push(raw));
    expect(told).toEqual([{ frames: 1, size: 1 }]);
    expect(routed).toEqual([]);
  });

  it("holds no more than its frames and its size, whatever sizes come", () => {
    const next = seededIntegers(0x5eed);
    for (let run = 0; run < 200; run++) {
      const ws = createFakeSocket();
      let overflowed = false;
      const inbox = holdFrames(ws, LIMITS, () => {
        overflowed = true;
      });
      const sent: number[] = [];
      for (let i = 0; i < 80 && !overflowed; i++) {
        const size = next(1_200);
        sent.push(size);
        ws.emit("message", { data: "y".repeat(size) });
      }
      const routed: string[] = [];
      inbox.open((raw) => routed.push(raw));
      const held = routed.reduce((total, raw) => total + raw.length, 0);
      expect(routed.length).toBeLessThanOrEqual(LIMITS.frames);
      expect(held).toBeLessThanOrEqual(LIMITS.size);
      if (overflowed) expect(routed).toEqual([]);
      else expect(sent.every((size) => size <= LIMITS.frameSize)).toBe(true);
    }
  });
});

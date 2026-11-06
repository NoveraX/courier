/**
 * What a socket sends before its connection is admitted is held for it,
 * bounded twice: by how many frames, and by how much they hold together —
 * a frame larger than a message may be is never taken in at all.
 */
import { describe, expect, it } from "vitest";

import { holdFrames } from "../src/adapter/ws-inbox";
import { createFakeSocket } from "./helpers/fake-socket";
import { seededIntegers } from "./helpers/seeded-random";

const LIMITS = { frames: 50, size: 4_000, frameSize: 1_000 };

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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UploadProgress } from "../src/http-client/types";
import { smoothProgress } from "../src/utils/smooth-progress";

const MB = 1_048_576;
const at = (percent: number, totalBytes = 8 * MB): UploadProgress => ({
  percent,
  transferredBytes: Math.round(percent * totalBytes),
  totalBytes,
});

let shown: number[];
let report: (progress: UploadProgress) => void;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  shown = [];
  report = smoothProgress((progress) => shown.push(progress.percent));
});

afterEach(() => {
  vi.useRealTimers();
});

const steps = () => shown.slice(1).map((percent, index) => percent - (shown[index] ?? 0));

describe("smoothProgress", () => {
  it("starts the bar at 0 at once, and spreads a step over the time that follows", () => {
    report(at(0.1));
    expect(shown).toEqual([0]);

    vi.advanceTimersByTime(600);

    expect(shown.length).toBeGreaterThan(10);
    expect(Math.max(...steps())).toBeLessThan(0.03);
    expect(shown.at(-1)).toBe(0.1);
  });

  it("never runs ahead of the transfer, nor goes back", () => {
    report(at(0.3));
    vi.advanceTimersByTime(60);
    report(at(0.2));
    vi.advanceTimersByTime(600);
    report(at(0.4));
    vi.advanceTimersByTime(1000);

    expect(Math.max(...shown)).toBeLessThanOrEqual(0.4);
    expect(shown).toEqual([...shown].sort((a, b) => a - b));
    expect(shown.at(-1)).toBe(0.4);
  });

  it("comes to rest at 100% once the transfer reports it, and says it once", () => {
    report(at(0.5));
    vi.advanceTimersByTime(100);
    report(at(1));
    vi.advanceTimersByTime(1000);

    expect(shown.filter((percent) => percent === 1)).toHaveLength(1);
    expect(shown.at(-1)).toBe(1);
  });

  it("stops moving once it is where the transfer is", () => {
    report(at(0.2));
    vi.advanceTimersByTime(1000);
    const count = shown.length;

    vi.advanceTimersByTime(5000);

    expect(shown).toHaveLength(count);
  });

  it("tells each event of a transfer with no size as it came", () => {
    report(at(0, 0));
    report({ percent: 0, transferredBytes: 1024, totalBytes: 0 });

    expect(shown).toEqual([0, 0]);
  });
});

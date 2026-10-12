/**
 * What a scale measurement reports: each figure against its budget — at
 * most it, or at least it where more is better — percentiles of timed
 * samples, and a report a line a figure.
 */
import { describe, expect, it } from "vitest";

import { measured, percentiles, report } from "./metrics.mjs";

describe("a figure", () => {
  it("is within its budget at or under it, or at or over it where more is better", () => {
    expect(measured("mocks.p99", 10, "ms", 10).ok).toBe(true);
    expect(measured("mocks.p99", 10.01, "ms", 10).ok).toBe(false);
    expect(measured("mocks.rps", 2999, "req/s", 3000, { more: true }).ok).toBe(false);
    expect(measured("mocks.rps", 3000, "req/s", 3000, { more: true }).ok).toBe(true);
  });

  it("is reported to two decimals, its budget too, while it is judged unrounded", () => {
    const figure = measured("payload.attached", 4.006, "ms", 4.004999, { note: "1.77×" });

    expect(figure).toEqual({
      name: "payload.attached",
      value: 4.01,
      unit: "ms",
      budget: 4,
      ok: false,
      note: "1.77×",
    });
  });

  it("keeps a budget of no bound as it is", () => {
    expect(measured("fixture.files", 1420, "files", Number.POSITIVE_INFINITY)).toMatchObject({
      budget: Number.POSITIVE_INFINITY,
      ok: true,
    });
  });
});

describe("percentiles", () => {
  it("are read from the samples sorted, whatever order they came in", () => {
    const samples = Array.from({ length: 100 }, (_, at) => 100 - at);

    expect(percentiles(samples)).toMatchObject({ p50: 51, p95: 96, p99: 100, max: 100 });
    expect(percentiles([])).toMatchObject({ p50: 0, max: 0 });
  });
});

describe("the report", () => {
  it("has a line a figure, marked, with its budget and its note", () => {
    const text = report([measured("a", 1, "ms", 2), measured("bb", 3, "ms", 2, { note: "slow" })]);

    expect(text.split("\n")).toEqual([
      expect.stringMatching(/^✓ a\s+1 ms\s+budget 2$/),
      expect.stringMatching(/^✗ bb\s+3 ms\s+budget 2 {2}— slow$/),
    ]);
  });
});

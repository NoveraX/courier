/**
 * A duration in the unit a person reads it in: milliseconds under a second,
 * so a short budget never reads as `0 s`, and seconds to a tenth above.
 */
import { describe, expect, it } from "vitest";

import { formatDuration } from "../src/server/format-duration";

describe("formatDuration", () => {
  it("gives a duration under a second in whole milliseconds", () => {
    expect(formatDuration(1)).toBe("1 ms");
    expect(formatDuration(40)).toBe("40 ms");
    expect(formatDuration(999)).toBe("999 ms");
  });

  it("gives a second and more in seconds, to a tenth", () => {
    expect(formatDuration(1000)).toBe("1 s");
    expect(formatDuration(1550)).toBe("1.6 s");
    expect(formatDuration(20_000)).toBe("20 s");
  });
});

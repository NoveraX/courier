/**
 * A session's length on the status bar's clock.
 */
import { describe, expect, it } from "vitest";

import { sessionClock } from "@/shell/session-clock";

describe("sessionClock", () => {
  it("reads minutes and seconds, and hours past one", () => {
    expect(sessionClock(0)).toBe("00:00");
    expect(sessionClock(204_000)).toBe("03:24");
    expect(sessionClock(3_804_000)).toBe("1:03:24");
  });

  it("never runs backwards", () => {
    expect(sessionClock(-5_000)).toBe("00:00");
  });
});

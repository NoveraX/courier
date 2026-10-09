import { describe, expect, it } from "vitest";

import { limitText, waitText } from "../../src/protocol/limit-text";

describe("a limit, in words", () => {
  it("names a whole window by its unit, and several of them by their count", () => {
    expect(limitText({ maxCalls: 1, window: 60_000 })).toBe("1 call a minute");
    expect(limitText({ maxCalls: 5, window: 3_600_000 })).toBe("5 calls an hour");
    expect(limitText({ maxCalls: 100, window: 86_400_000 })).toBe("100 calls a day");
    expect(limitText({ maxCalls: 3, window: 30_000 })).toBe("3 calls every 30 seconds");
    expect(limitText({ maxCalls: 3, window: 300_000 })).toBe("3 calls every 5 minutes");
    expect(limitText({ maxCalls: 3, window: 1_500 })).toBe("3 calls every 1.5 seconds");
  });

  it("rounds a wait up, to seconds, minutes or hours as it grows", () => {
    expect(waitText(37_200)).toBe("38 s");
    expect(waitText(119_000)).toBe("119 s");
    expect(waitText(150_000)).toBe("3 min");
    expect(waitText(3_600_000)).toBe("60 min");
    expect(waitText(7_300_000)).toBe("3 h");
  });
});

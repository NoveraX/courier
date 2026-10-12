/**
 * When a public demo resets, as a phrase to follow the demo's name on the
 * banner's single line: every sentence the full banner says, without its
 * subject and full stop.
 */
import { describe, expect, it } from "vitest";

import { demoResetPhrase } from "@/shell/demo-reset-phrase";

const NOW = Date.UTC(2026, 9, 5, 17, 22);

describe("demoResetPhrase", () => {
  it("says when the demo resets, in whole minutes rounded up", () => {
    expect(demoResetPhrase(NOW + 37.5 * 60_000, NOW)).toBe("resets in 38 min");
    expect(demoResetPhrase(NOW + 30_000, NOW)).toBe("resets within a minute");
    expect(demoResetPhrase(NOW + 3 * 60 * 60_000, NOW)).toBe("resets in about 3 h");
  });

  it("says the demo is resetting once it is due, and that it resets now and then when it does not say", () => {
    expect(demoResetPhrase(NOW - 1, NOW)).toBe("is resetting now");
    expect(demoResetPhrase(undefined, NOW)).toBe("is reset now and then");
  });
});

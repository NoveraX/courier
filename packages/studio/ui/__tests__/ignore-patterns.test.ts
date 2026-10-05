/**
 * The ignore patterns Studio matches requests against: regular
 * expressions, case-insensitive, tested on the URL — one that is not an
 * expression is skipped, and Studio says so rather than dropping it
 * without a word.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EventPayload } from "@/store/actions-event-utils";
import { shouldIgnoreRequest } from "@/store/actions-event-utils";

const start = (url: string): EventPayload => ({
  id: "r1",
  type: "request:start",
  timestamp: 1,
  sessionId: "s",
  url,
  method: "list",
});

afterEach(() => vi.restoreAllMocks());

describe("the ignore patterns", () => {
  it("match a request's URL as case-insensitive regular expressions", () => {
    const patterns = ["^https?://[^/]+/health$", "\\.PNG$"];

    expect(shouldIgnoreRequest(start("http://localhost:3000/health"), patterns)).toBe(true);
    expect(shouldIgnoreRequest(start("http://localhost:3000/logo.png"), patterns)).toBe(true);
    expect(shouldIgnoreRequest(start("http://localhost:3000/api/users"), patterns)).toBe(false);
  });

  it("skip a pattern that is not a regular expression, saying which, and keep the others", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const patterns = ["*.png", "/health"];

    expect(shouldIgnoreRequest(start("http://localhost/health"), patterns)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toBe(
      'Studio skips the ignore pattern "*.png": it is not a regular expression',
    );
  });
});

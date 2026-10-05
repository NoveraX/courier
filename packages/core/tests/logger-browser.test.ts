/**
 * The browser logger's console call: context and message are substitution
 * arguments, never part of the format string, so text from a server that
 * contains `%c`, `%s` or `%o` cannot consume the styles or the cause; and a
 * warning's or an error's context reads in the row's own colour, which each
 * DevTools theme sets for it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { browserLogger } from "../src/logger/browser";

afterEach(() => vi.restoreAllMocks());

describe("browserLogger", () => {
  it("keeps a % sequence in the message out of the format, and the cause last", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cause = new SyntaxError("Unexpected token");

    browserLogger.warn("SSE", 'bad data {"pct": 100%c}', cause);

    const [format, ...args] = warn.mock.calls[0] ?? [];
    expect(format).not.toContain("100%c");
    expect(args).toContain('bad data {"pct": 100%c}');
    expect(args.at(-1)).toBe(cause);
  });

  it("uses one %s per substituted string and one %c per style", () => {
    const info = vi.spyOn(console, "log").mockImplementation(() => {});

    browserLogger.info("Ctx", "hello");

    const [format, ...args] = info.mock.calls[0] ?? [];
    const directives = String(format).match(/%[cs]/g) ?? [];
    expect(directives).toHaveLength(args.length);
  });

  it("writes a warning's and an error's context in the colour of the row, in either DevTools theme", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    browserLogger.warn("SSE", "slow");
    browserLogger.error("SSE", "failed");

    for (const call of [warn.mock.calls[0], error.mock.calls[0]]) {
      expect(call).toBeDefined();
      const contextStyle = String(call?.[3]);
      expect(contextStyle).toContain("color: inherit");
      expect(contextStyle).not.toMatch(/#[0-9a-f]{6}/i);
    }
  });
});

/**
 * The browser logger's console call: context and message are substitution
 * arguments, never part of the format string, so text from a server that
 * contains `%c`, `%s` or `%o` cannot consume the styles or the cause.
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
});

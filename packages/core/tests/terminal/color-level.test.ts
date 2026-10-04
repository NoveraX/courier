/**
 * How many colours a stream gets: what FORCE_COLOR forces — raised to
 * 24-bit where COLORTERM says the terminal behind a pipe shows it — else
 * none for NO_COLOR, TERM=dumb or a pipe, else what the terminal reports.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { colorLevel } from "../../src/terminal/color-level";

const terminal = (depth: number) => ({ isTTY: true, getColorDepth: () => depth });
const pipe = { isTTY: false };

beforeEach(() => {
  for (const name of ["FORCE_COLOR", "NO_COLOR", "TERM", "COLORTERM"]) vi.stubEnv(name, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("colorLevel", () => {
  it("is what the terminal reports, and none for a pipe or a terminal without colour", () => {
    expect(colorLevel(terminal(24))).toBe(24);
    expect(colorLevel(terminal(8))).toBe(8);
    expect(colorLevel(terminal(4))).toBe(4);
    expect(colorLevel(terminal(1))).toBe(0);
    expect(colorLevel(pipe)).toBe(0);
    expect(colorLevel(undefined)).toBe(0);
  });

  it("is 16 colours for a terminal that cannot say how many it shows", () => {
    expect(colorLevel({ isTTY: true })).toBe(4);
  });

  it("is none on a terminal for a non-empty NO_COLOR or TERM=dumb", () => {
    vi.stubEnv("NO_COLOR", "1");
    expect(colorLevel(terminal(24))).toBe(0);
    vi.stubEnv("NO_COLOR", "");
    expect(colorLevel(terminal(24))).toBe(24);
    vi.stubEnv("TERM", "dumb");
    expect(colorLevel(terminal(24))).toBe(0);
  });

  it("is what FORCE_COLOR says, even into a pipe and over NO_COLOR", () => {
    vi.stubEnv("NO_COLOR", "1");
    const forced = (value: string) => {
      vi.stubEnv("FORCE_COLOR", value);
      return colorLevel(pipe);
    };

    expect([forced(""), forced("1"), forced("true"), forced("2"), forced("3")]).toEqual([
      4, 4, 4, 8, 24,
    ]);
    expect([forced("0"), forced("false"), forced("yes")]).toEqual([0, 0, 0]);
  });

  it("raises a forced level to 24-bit where COLORTERM says the terminal shows it", () => {
    vi.stubEnv("FORCE_COLOR", "1");
    vi.stubEnv("COLORTERM", "truecolor");

    expect(colorLevel(pipe)).toBe(24);
    vi.stubEnv("FORCE_COLOR", "0");
    expect(colorLevel(pipe)).toBe(0);
  });
});

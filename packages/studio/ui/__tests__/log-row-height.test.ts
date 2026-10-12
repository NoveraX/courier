/**
 * How tall a row of a mock's log is, which the list places every row by
 * without measuring it: one line to a mouse, a taller one to a finger, and
 * two lines in a list too narrow for the columns.
 */
import { describe, expect, it } from "vitest";

import { logRowHeight } from "@/screens/mocks/log-row-height";

describe("a row of a mock's log", () => {
  it("is one line high to a mouse", () => {
    expect(logRowHeight(false, false)).toBe(34);
  });

  it("is taller to a finger, which needs the room to land", () => {
    expect(logRowHeight(false, true)).toBe(44);
  });

  it("takes two lines in a narrow list, to a finger or a mouse", () => {
    expect([logRowHeight(true, false), logRowHeight(true, true)]).toEqual([52, 52]);
  });
});

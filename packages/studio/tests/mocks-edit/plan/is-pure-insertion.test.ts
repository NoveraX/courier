import { describe, expect, it } from "vitest";

import { isPureInsertion } from "../../../src/server/mocks-edit/plan/is-pure-insertion";

describe("isPureInsertion", () => {
  it("accepts ascending insertions that produce the new text", () => {
    const edits = [
      { start: 1, end: 1, text: " a" },
      { start: 2, end: 2, text: "!" },
    ];

    expect(isPureInsertion("{}", "{ a}!", edits)).toBe(true);
  });

  it("rejects an edit that replaces text", () => {
    expect(isPureInsertion("{}", "{a", [{ start: 1, end: 2, text: "a" }])).toBe(false);
  });

  it("rejects an empty insertion", () => {
    expect(isPureInsertion("{}", "{}", [{ start: 1, end: 1, text: "" }])).toBe(false);
  });

  it("rejects insertions out of order", () => {
    const edits = [
      { start: 2, end: 2, text: "b" },
      { start: 1, end: 1, text: "a" },
    ];

    expect(isPureInsertion("{}", "{a}b", edits)).toBe(false);
  });

  it("rejects two insertions at one offset", () => {
    const edits = [
      { start: 1, end: 1, text: "a" },
      { start: 1, end: 1, text: "b" },
    ];

    expect(isPureInsertion("{}", "{ab}", edits)).toBe(false);
  });

  it("rejects an insertion past the end of the old text", () => {
    expect(isPureInsertion("{}", "{}a", [{ start: 3, end: 3, text: "a" }])).toBe(false);
  });

  it("rejects insertions that do not produce the claimed text", () => {
    expect(isPureInsertion("{}", "{ b }", [{ start: 1, end: 1, text: " a " }])).toBe(false);
  });
});

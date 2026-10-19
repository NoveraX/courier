/**
 * A segment of a path as the mock matches requests against it — text, a
 * doubled colon one colon in it; one parameter; parameters beside text, as
 * Google's `:name::cancel` — and the order routes are tried in: text first,
 * a parameter alone last.
 */
import { describe, expect, it } from "vitest";

import { segmentKind, segmentTemplate, specificity } from "../../src/server/segment-template";

describe("segmentTemplate", () => {
  it("reads text, a doubled colon one colon of it", () => {
    const text = segmentTemplate("index::inspect");

    expect(text).toMatchObject({ kind: "text", text: "index:inspect", names: [] });
    expect(text.match("index:inspect")).toEqual([]);
    expect(text.match("index::inspect")).toBeUndefined();
  });

  it("reads one parameter as the whole segment", () => {
    const param = segmentTemplate(":id");

    expect(param).toMatchObject({ kind: "param", name: "id", names: ["id"] });
    expect(param.match("p 1")).toEqual(["p 1"]);
  });

  it("splits parameters out of a segment they share with text", () => {
    const cancel = segmentTemplate(":name::cancel");

    expect(cancel).toMatchObject({ kind: "mixed", names: ["name"] });
    expect(cancel.match("op-1:cancel")).toEqual(["op-1"]);
    expect(cancel.match("a:b:cancel")).toEqual(["a:b"]);
    expect(cancel.match("op-1:archive")).toBeUndefined();
    expect(segmentTemplate(":from-:to").match("A1-B2")).toEqual(["A1", "B2"]);
    expect(segmentTemplate(":id.json").match("7.json")).toEqual(["7"]);
  });

  it("writes a pattern in which no route syntax reads anything but its parameters", () => {
    const { pattern } = segmentTemplate(":name::{cancel}(x)");

    expect(pattern).not.toMatch(/[(){}:]/);
    expect(new RegExp(`^${pattern}$`).test("op-1:{cancel}(x)")).toBe(true);
    expect(new RegExp(`^${pattern}$`).test("op-1:cancel")).toBe(false);
  });
});

describe("segmentKind", () => {
  it("reads a segment as its template does, without the pattern", () => {
    for (const segment of ["index::inspect", ":id", ":name::cancel", ":from-:to", "::batchGet"]) {
      expect(segmentKind(segment)).toBe(segmentTemplate(segment).kind);
    }
  });
});

describe("specificity", () => {
  it("sorts text before parameters beside text, before a parameter alone", () => {
    const paths = [":id", ":id::cancel", "stats"];

    paths.sort((a, b) => specificity(a).localeCompare(specificity(b)));

    expect(paths).toEqual(["stats", ":id::cancel", ":id"]);
  });

  it("reads a segment of text with a colon in it as text", () => {
    expect(specificity("v1/index::inspect")).toBe(specificity("v1/inspect"));
  });
});

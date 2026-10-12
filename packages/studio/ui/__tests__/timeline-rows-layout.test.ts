/**
 * How tall the Timeline's rows are: two lines where the list is too narrow
 * for its columns, one otherwise — taller under a finger — and the columns
 * a wide list adds.
 */
import { describe, expect, it } from "vitest";

import { listTierOf } from "@/design/breakpoints";
import { columnsOf, rowHeightOf, WIDE_FROM } from "@/screens/timeline/table-columns";

describe("rowHeightOf", () => {
  it("gives a row on one line its desktop height under a mouse", () => {
    expect(rowHeightOf("narrow", false)).toBe(34);
    expect(rowHeightOf("wide", false)).toBe(34);
  });

  it("makes a row on one line tall enough for a finger's tap", () => {
    expect(rowHeightOf("narrow", true)).toBe(44);
    expect(rowHeightOf("wide", true)).toBe(44);
  });

  it("gives a stacked row room for its two lines, mouse or finger", () => {
    expect(rowHeightOf("stacked", false)).toBe(52);
    expect(rowHeightOf("stacked", true)).toBe(52);
  });

  it("stacks the rows of a phone's list, and keeps the columns of a list not measured yet", () => {
    expect(rowHeightOf(listTierOf(375, WIDE_FROM), true)).toBe(52);
    expect(rowHeightOf(listTierOf(0, WIDE_FROM), false)).toBe(34);
  });
});

describe("columnsOf", () => {
  it("adds the Mode and Size columns to a wide list's template", () => {
    expect(columnsOf(true).match(/_/g)).toHaveLength(7);
    expect(columnsOf(false).match(/_/g)).toHaveLength(5);
  });
});

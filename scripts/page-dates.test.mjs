/**
 * Tests for `scripts/page-dates.mjs`: how a docs page's date is read,
 * judged against the day its text changed, and written.
 */

import { describe, expect, it } from "vitest";
import {
  dateProblem,
  isPageDate,
  pageDate,
  pageText,
  shiftDate,
  withPageDate,
} from "./page-dates.mjs";

const ONE_LINE =
  'export const metadata = { title: "T", description: "D", updated: "2026-10-14" }\n\nText.';
const MULTI_LINE = [
  "export const metadata = {",
  '  title: "T",',
  '  description: "D",',
  '  updated: "2026-10-14",',
  "}",
  "",
  "Text.",
].join("\n");

describe("a page's date", () => {
  it("is read from the metadata export, written on one line or several", () => {
    expect(pageDate(ONE_LINE)).toBe("2026-10-14");
    expect(pageDate(MULTI_LINE)).toBe("2026-10-14");
    expect(
      pageDate('export const metadata = { title: "T" }\n\nupdated: "2026-01-01"'),
    ).toBeUndefined();
  });

  it("names a real day as YYYY-MM-DD", () => {
    expect(isPageDate("2026-10-14")).toBe(true);
    expect(isPageDate("2026-02-30")).toBe(false);
    expect(isPageDate("14.10.2026")).toBe(false);
    expect(isPageDate(undefined)).toBe(false);
  });

  it("moves by whole days across months and years", () => {
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("a page's text", () => {
  it("does not change when only its date, or the export's spacing, does", () => {
    const redated = ONE_LINE.replace("2026-10-14", "2026-10-19");
    const rewrapped = 'export const metadata = {\n  title: "T",\n  description: "D",\n}\n\nText.';
    expect(pageText(redated)).toBe(pageText(ONE_LINE));
    expect(pageText(rewrapped)).toBe(pageText(ONE_LINE));
  });

  it("changes when its body or another field does", () => {
    expect(pageText(ONE_LINE.replace("Text.", "Other text."))).not.toBe(pageText(ONE_LINE));
    expect(pageText(ONE_LINE.replace('title: "T"', 'title: "U"'))).not.toBe(pageText(ONE_LINE));
  });
});

describe("a date judged against the change", () => {
  it("passes when it is no older than the day the text changed, with a day to spare", () => {
    expect(dateProblem("2026-10-19", "2026-10-19", "2026-10-19")).toBeNull();
    expect(dateProblem("2026-10-18", "2026-10-19", "2026-10-19")).toBeNull();
  });

  it("fails when it is older, missing, or still to come", () => {
    expect(dateProblem("2026-10-14", "2026-10-19", "2026-10-19")).toContain(
      "changed on 2026-10-19",
    );
    expect(dateProblem(undefined, "2026-10-19", "2026-10-19")).toContain("YYYY-MM-DD");
    expect(dateProblem("2026-10-25", "2026-10-19", "2026-10-19")).toContain("still to come");
  });
});

describe("writing a date", () => {
  it("replaces the one a page writes", () => {
    expect(pageDate(withPageDate(ONE_LINE, "2026-10-19"))).toBe("2026-10-19");
    expect(pageDate(withPageDate(MULTI_LINE, "2026-10-19"))).toBe("2026-10-19");
  });

  it("adds one as the export's last field, on one line or several", () => {
    const oneLine = 'export const metadata = { title: "T", mode: "both" }\n\nText.';
    const multiLine = 'export const metadata = {\n  title: "T",\n  description: "D"\n}\n\nText.';
    expect(withPageDate(oneLine, "2026-10-19")).toBe(
      'export const metadata = { title: "T", mode: "both", updated: "2026-10-19" }\n\nText.',
    );
    expect(withPageDate(multiLine, "2026-10-19")).toBe(
      'export const metadata = {\n  title: "T",\n  description: "D",\n  updated: "2026-10-19",\n}\n\nText.',
    );
  });
});

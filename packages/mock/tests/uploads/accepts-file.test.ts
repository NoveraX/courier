import { describe, expect, it } from "vitest";

import { acceptsFile } from "../../src/uploads/accepts-file";

describe("the types an upload takes, read as <input accept> reads them", () => {
  it("take a file whose type is listed, its parameters and case aside", () => {
    expect(acceptsFile(["application/pdf"], { name: "q3", type: "Application/PDF" })).toBe(true);
    expect(acceptsFile(["text/csv"], { name: "a", type: "text/csv; charset=utf-8" })).toBe(true);
  });

  it("take any type of a family listed as type/*", () => {
    expect(acceptsFile(["image/*"], { name: "a.png", type: "image/png" })).toBe(true);
    expect(acceptsFile(["image/*"], { name: "a.mp4", type: "video/mp4" })).toBe(false);
  });

  it("take a file by the end of its name, for an extension listed", () => {
    expect(acceptsFile([".pdf"], { name: "Q3 Report.PDF", type: "" })).toBe(true);
    expect(acceptsFile([".pdf"], { name: "q3.pdf.exe", type: "" })).toBe(false);
  });

  it("refuse raw bytes with no name to an extension, and with no type to a type", () => {
    expect(acceptsFile([".pdf"], { name: "", type: "application/pdf" })).toBe(false);
    expect(acceptsFile(["image/*"], { name: "photo", type: "" })).toBe(false);
  });

  it("take any file when the list is empty, or lists */*", () => {
    expect(acceptsFile([], { name: "a.exe", type: "application/x-msdownload" })).toBe(true);
    expect(acceptsFile(["*/*"], { name: "a", type: "" })).toBe(true);
  });
});

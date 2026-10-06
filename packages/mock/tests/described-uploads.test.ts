import { describe, expect, it } from "vitest";

import { describedUploads } from "../src/described-uploads";

describe("the variables Studio shows for a request", () => {
  it("show each file a form sent by its name, type and size", () => {
    const file = new File(["%PDF"], "q3.pdf", { type: "application/pdf" });

    expect(describedUploads({ title: "Q3", file, pages: [file, file] })).toEqual({
      title: "Q3",
      file: { name: "q3.pdf", type: "application/pdf", size: 4 },
      pages: [
        { name: "q3.pdf", type: "application/pdf", size: 4 },
        { name: "q3.pdf", type: "application/pdf", size: 4 },
      ],
    });
  });

  it("show a file sent as the whole body by its type and size, with no name", () => {
    const body = new Blob(["%PDF-1.7"], { type: "application/pdf" });

    expect(describedUploads(body)).toEqual({ name: "", type: "application/pdf", size: 8 });
  });

  it("leave variables with no file as they are", () => {
    const variables = { title: "Q3", tags: ["a"] };

    expect(describedUploads(variables)).toBe(variables);
    expect(describedUploads(undefined)).toBeUndefined();
  });
});

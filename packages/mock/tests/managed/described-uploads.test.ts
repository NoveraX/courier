import { describe, expect, it } from "vitest";

import { describedUploads } from "../../src/managed/described-uploads";

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

  it("leave variables with no file as they are", () => {
    const variables = { title: "Q3", tags: ["a"] };

    expect(describedUploads(variables)).toBe(variables);
    expect(describedUploads(undefined)).toBeUndefined();
  });
});

/**
 * Building a request body from the caller's variables.
 */
import { describe, expect, it } from "vitest";

import { filterEmptyFiles } from "../src/http-client/body-builder";

describe("a multipart field holding several files", () => {
  it("keeps the real files when one of them is empty", () => {
    const form = new FormData();
    form.append("files", new File(["a"], "a.txt"));
    form.append("files", new File([], ""));
    form.append("files", new File(["c"], "c.txt"));
    form.append("note", "hi");

    filterEmptyFiles(form);

    expect(form.getAll("files").map((file) => (file as File).name)).toEqual(["a.txt", "c.txt"]);
    expect(form.get("note")).toBe("hi");
  });
});

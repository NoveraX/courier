/**
 * The form a Playground call carries, as Studio checks it before a runtime
 * sends it.
 */
import { describe, expect, it } from "vitest";

import { sanitizeForm } from "../src/server/playground-form";

describe("a Playground form", () => {
  it("passes text fields and files with their bytes", () => {
    const data = new Uint8Array([1, 2, 3]);
    const form = [
      { name: "note", text: "hi" },
      { name: "file", file: { name: "a.bin", type: "application/octet-stream", data } },
    ];

    expect(sanitizeForm(form)).toEqual(form);
  });

  it("is absent when the call sends none", () => {
    expect(sanitizeForm(undefined)).toBeUndefined();
  });

  it("is refused when a field has no name, or a file no bytes", () => {
    expect(sanitizeForm([{ name: "", text: "x" }])).toBeNull();
    expect(sanitizeForm([{ name: "f", file: { name: "a", type: "", data: "abc" } }])).toBeNull();
    expect(sanitizeForm({ name: "note", text: "hi" })).toBeNull();
  });
});

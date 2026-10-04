/**
 * A raw Postman body read as Postman sends it: JSON, with the comments and
 * trailing commas Postman strips before sending. Such a body was taken for
 * one that is not JSON, and its endpoint was generated with no variables.
 */
import { describe, expect, it } from "vitest";

import { readJsonText } from "../../../src/apis/parser/read-json-text";

describe("readJsonText", () => {
  it("reads JSON with line and block comments and trailing commas", () => {
    const text =
      '{\n  // the order\n  "id": "a", /* its total */ "total": 1,\n  "tags": ["x", "y",],\n}';

    expect(readJsonText(text)).toEqual({ value: { id: "a", total: 1, tags: ["x", "y"] } });
  });

  it("leaves what looks like a comment or a comma inside a string as it is", () => {
    const text = '{ "url": "https://api.example/a,", "note": "a /* b */ c" }';

    expect(readJsonText(text)).toEqual({
      value: { url: "https://api.example/a,", note: "a /* b */ c" },
    });
  });

  it("reads no value from a body that is not JSON", () => {
    expect(readJsonText("<order id='a'/>")).toBeUndefined();
  });
});

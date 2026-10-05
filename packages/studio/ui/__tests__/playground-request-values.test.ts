/**
 * The Variables and Headers editors are read as the request they describe,
 * and text that does not describe one is refused with the reason, never
 * sent without the values it was meant to carry.
 */
import { describe, expect, it } from "vitest";

import { readRequestValues } from "@/features/playground/request-values";

describe("the values a request is sent with", () => {
  it("reads JSON with comments and trailing commas", () => {
    expect(readRequestValues('{\n  // the user\n  "id": 1,\n}', '{ "x-tag": "a" }')).toEqual({
      ok: true,
      values: { variables: { id: 1 }, headers: { "x-tag": "a" } },
    });
  });

  it("reads an empty editor as nothing to send", () => {
    expect(readRequestValues("", "  ")).toEqual({
      ok: true,
      values: { variables: undefined, headers: {} },
    });
  });

  it("refuses variables that are not JSON", () => {
    expect(readRequestValues('{ "id": ', "{}")).toEqual({
      ok: false,
      problem: "Variables are not valid JSON",
    });
  });

  it("refuses headers that are not an object of strings", () => {
    expect(readRequestValues("{}", '{ "x-tag": ')).toEqual({
      ok: false,
      problem: "Headers are not valid JSON",
    });
    expect(readRequestValues("{}", '{ "x-retries": 3 }')).toEqual({
      ok: false,
      problem: "Headers must be an object of string values",
    });
    expect(readRequestValues("{}", '["x-tag"]')).toEqual({
      ok: false,
      problem: "Headers must be an object of string values",
    });
  });
});

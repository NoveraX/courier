/**
 * The bodies Studio's API routes read, checked where they arrive: a body
 * that is not what the route reads is answered 400 naming the field, and
 * the route goes no further.
 */
import { describe, expect, it } from "vitest";

import type { JsonResponse } from "../src/server/route-types";
import {
  isObject,
  validateDiffBody,
  validateGenerateBody,
  validateParseBody,
} from "../src/server/validate-body";

interface Answered extends JsonResponse {
  code?: number;
  body?: unknown;
}

function response(): Answered {
  const answered: Answered = {
    status(code) {
      answered.code = code;
      return answered;
    },
    json(body) {
      answered.body = body;
    },
  };
  return answered;
}

function refusal(field: string): { code: number; body: unknown } {
  return { code: 400, body: { error: `Missing or invalid field: ${field}` } };
}

describe("validateParseBody", () => {
  it("reads a specification from a URL, a text or a file", () => {
    for (const source of ["url", "raw", "file"]) {
      const res = response();

      expect(validateParseBody({ source, content: "x" }, res)).toEqual({ source, content: "x" });
      expect(res.code).toBeUndefined();
    }
  });

  it.each([
    ["a body that is not an object", ["url", "x"], "body"],
    ["a missing body", undefined, "body"],
    ["a source Studio does not read from", { source: "ftp", content: "x" }, "source"],
    ["a source that is not a string", { source: 1, content: "x" }, "source"],
    ["content that is not a string", { source: "raw", content: { openapi: "3.1.0" } }, "content"],
  ])("refuses %s", (_case, body, field) => {
    const res = response();

    expect(validateParseBody(body, res)).toBeNull();
    expect({ code: res.code, body: res.body }).toEqual(refusal(field));
  });
});

describe("validateGenerateBody", () => {
  it("reads the specification and the options", () => {
    const res = response();

    expect(validateGenerateBody({ spec: { name: "api" }, options: {} }, res)).toEqual({
      spec: { name: "api" },
      options: {},
    });
  });

  it.each([
    ["a specification that is an array", { spec: [], options: {} }, "spec"],
    ["missing options", { spec: {} }, "options"],
    ["options that are null", { spec: {}, options: null }, "options"],
  ])("refuses %s", (_case, body, field) => {
    const res = response();

    expect(validateGenerateBody(body, res)).toBeNull();
    expect({ code: res.code, body: res.body }).toEqual(refusal(field));
  });
});

describe("validateDiffBody", () => {
  it("reads the two specifications", () => {
    expect(validateDiffBody({ oldSpec: { a: 1 }, newSpec: { b: 2 } }, response())).toEqual({
      oldSpec: { a: 1 },
      newSpec: { b: 2 },
    });
  });

  it.each([
    ["a missing old specification", { newSpec: {} }, "oldSpec"],
    ["a new specification that is text", { oldSpec: {}, newSpec: "{}" }, "newSpec"],
  ])("refuses %s", (_case, body, field) => {
    const res = response();

    expect(validateDiffBody(body, res)).toBeNull();
    expect({ code: res.code, body: res.body }).toEqual(refusal(field));
  });
});

describe("isObject", () => {
  it("holds for a JSON object alone", () => {
    expect(isObject({})).toBe(true);
    expect(isObject([])).toBe(false);
    expect(isObject(null)).toBe(false);
    expect(isObject("{}")).toBe(false);
  });
});

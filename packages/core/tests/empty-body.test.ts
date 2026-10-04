/**
 * An absent body is an answer, not a failure: a HEAD request's only standard
 * success carries none, and neither does a write that returns nothing —
 * neither is an HTTPError whose status is 200.
 */
import { describe, expect, it } from "vitest";

import { HTTPError } from "../src/errors";
import { getResponseData } from "../src/http-client/response";

const json = (body: string, status = 200): Response =>
  new Response(body, { status, headers: { "content-type": "application/json" } });

describe("a success with no body", () => {
  it("reads as null on a 200, which is what HEAD returns", async () => {
    expect(await getResponseData(json("", 200), "json")).toBeNull();
  });

  it("does not raise an error carrying a success status", async () => {
    await expect(getResponseData(json("", 200), "json")).resolves.not.toThrow();
  });

  it("reads as null for every status defined as bodiless", async () => {
    for (const status of [204, 205, 304]) {
      expect(await getResponseData(new Response(null, { status }), "json")).toBeNull();
    }
  });

  it("reads as null when the body is empty and the status is a plain 201", async () => {
    expect(await getResponseData(json("", 201), "json")).toBeNull();
  });
});

describe("an ordinary body still parses", () => {
  it("returns the decoded value", async () => {
    expect(await getResponseData(json('{"id":7}'), "json")).toEqual({ id: 7 });
  });

  it("returns a decoded array", async () => {
    expect(await getResponseData(json("[1,2,3]"), "json")).toEqual([1, 2, 3]);
  });

  /** `null` and `0` are values; only the absence of a body is absence. */
  it("distinguishes a literal null body from no body", async () => {
    expect(await getResponseData(json("null"), "json")).toBeNull();
    expect(await getResponseData(json("0"), "json")).toBe(0);
  });
});

describe("a malformed body is still an error", () => {
  it("raises rather than silently reading as null", async () => {
    await expect(getResponseData(json("{ not json"), "json")).rejects.toBeInstanceOf(HTTPError);
  });

  it("carries the response status on the error", async () => {
    await expect(getResponseData(json("{ not json", 201), "json")).rejects.toMatchObject({
      status: 201,
    });
  });

  it("is kept as text when the answer is itself an error", async () => {
    expect(await getResponseData(json("{ not json", 500), "json")).toBe("{ not json");
  });
});

describe("other response types are untouched", () => {
  it("returns an empty string for text", async () => {
    expect(await getResponseData(json(""), "text")).toBe("");
  });

  it("still returns text content", async () => {
    expect(await getResponseData(new Response("hello"), "text")).toBe("hello");
  });
});

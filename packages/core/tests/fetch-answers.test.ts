/**
 * The standalone fetch client's reading of an answer.
 *
 * A HEAD request answered 404, 401 or 500 resolved as though the resource
 * were there, and a write answered 200 or 201 with no body threw a
 * SyntaxError — a success reported as a failure, and not one isHTTPError
 * recognises. The endpoint client had long read both correctly.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { HTTPError } from "../src/errors";
import { createFetch } from "../src/fetch";

afterEach(() => {
  vi.unstubAllGlobals();
});

function answer(response: Response): void {
  vi.stubGlobal("fetch", async () => response);
}

describe("HEAD", () => {
  it.each([401, 404, 500])("rejects with an HTTPError when answered %i", async (status) => {
    answer(new Response(null, { status }));

    const error = await createFetch({ baseURL: "https://api.example" }).head("/file").catch((e) => e);

    expect(error).toBeInstanceOf(HTTPError);
    expect((error as HTTPError).status).toBe(status);
  });

  it("resolves to the headers when the resource is there", async () => {
    answer(new Response(null, { status: 200, headers: { "content-length": "42" } }));

    const headers = await createFetch({ baseURL: "https://api.example" }).head("/file");

    expect(headers.get("content-length")).toBe("42");
  });
});

describe("a success with no body", () => {
  it.each([200, 201])("reads as null when answered %i", async (status) => {
    answer(new Response("", { status, headers: { "content-type": "application/json" } }));

    await expect(createFetch({ baseURL: "https://api.example" }).post("/items")).resolves.toBeNull();
  });
});

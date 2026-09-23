/**
 * Statuses that carry no body, on both sides of the proxy.
 *
 * The server wrote a JSON body for every status except 204, and the Response
 * constructor refuses a body for 205 and 304 — so an upstream honouring
 * `If-None-Match` turned the proxied call into an exception. The browser side
 * parsed every success as JSON, so the empty body of a 204 surfaced as a raw
 * SyntaxError, where direct mode resolves the same answer to `null`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProxyCaller } from "../src/proxy-caller";
import { buildResponse } from "../src/utils/execute-response";

const PROXY = { res: new Response() };

interface ItemsClient {
  items: { remove: (variables: { id: number }) => Promise<unknown> };
}

function answer(status: number): Response {
  return buildResponse(PROXY, {
    status,
    headers: new Headers({ etag: '"v1"' }),
    rawData: false,
    data: null,
  }) as Response;
}

describe("the proxy answering a bodiless upstream status", () => {
  for (const status of [204, 205, 304]) {
    it(`answers ${status} with that status and no body`, async () => {
      const response = answer(status);

      expect(response.status).toBe(status);
      expect(await response.text()).toBe("");
    });
  }

  it("keeps the validator a 304 is answered with", () => {
    expect(answer(304).headers.get("etag")).toBe('"v1"');
  });

  it("still writes a JSON body for an ordinary success", async () => {
    const response = buildResponse(PROXY, {
      status: 200,
      headers: new Headers(),
      rawData: false,
      data: { id: 7 },
    }) as Response;

    expect(await response.json()).toEqual({ id: 7 });
  });
});

describe("the browser reading a bodiless proxy answer", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves a 204 to null, as direct mode does", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));
    const client = createProxyCaller("api") as unknown as ItemsClient;

    await expect(client.items.remove({ id: 1 })).resolves.toBeNull();
  });

  it("resolves a 205 to null", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 205 }));
    const client = createProxyCaller("api") as unknown as ItemsClient;

    await expect(client.items.remove({ id: 1 })).resolves.toBeNull();
  });

  it("still decodes a JSON success", async () => {
    fetchSpy.mockResolvedValue(Response.json({ removed: 1 }));
    const client = createProxyCaller("api") as unknown as ItemsClient;

    await expect(client.items.remove({ id: 1 })).resolves.toEqual({ removed: 1 });
  });
});

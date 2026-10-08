/**
 * An answer's shape, for Studio to follow the contract's drift: each place
 * in the answer as it came back — before the response schema strips what it
 * does not declare — with the JSON types seen there, bounded however large
 * the answer is; sent to Studio for a 2xx answer of an endpoint with a
 * response schema, and for nothing else.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { courier, defineApi } from "../src/define";
import { studioHooks } from "../src/studio";
import { answerShapeOf } from "../src/studio/answer-shape";
import { executeRequest } from "../src/utils/execute";

const { endpoint } = courier();

describe("an answer's shape", () => {
  it("names each place with the types seen there, an array's items merged", () => {
    expect(
      answerShapeOf({ id: "p_1", price: 12, tags: ["a", null], seller: { id: 7, verified: true } }),
    ).toEqual({
      shape: {
        "": "object",
        id: "string",
        price: "number",
        tags: "array",
        "tags[]": "null|string",
        seller: "object",
        "seller.id": "number",
        "seller.verified": "boolean",
      },
      cut: false,
    });
  });

  it("reads an array's first items, and stops short of an answer too large or too deep", () => {
    const items = Array.from({ length: 500 }, (_, at) => ({ id: at, [`only${at}`]: true }));
    const deep = JSON.parse(`${"[".repeat(40)}1${"]".repeat(40)}`);

    expect(Object.keys(answerShapeOf(items).shape)).toHaveLength(3 + 20);
    expect(answerShapeOf(deep).cut).toBe(true);
    expect(
      answerShapeOf(Object.fromEntries(Array.from({ length: 2000 }, (_, at) => [`k${at}`, at])))
        .cut,
    ).toBe(true);
  });
});

describe("the shape Studio is sent", () => {
  const shop = defineApi({
    baseURL: "https://shop.example",
    endpoints: {
      product: endpoint.get("products/:id").response(z.object({ id: z.string() })),
      loose: endpoint.get("loose"),
    },
  });
  const shapes = vi.fn();

  beforeEach(() => {
    studioHooks.onRequestStart = vi.fn();
    studioHooks.onAnswerShape = shapes;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    studioHooks.onRequestStart = undefined;
    studioHooks.onAnswerShape = undefined;
    shapes.mockReset();
  });

  it("is the answer before the schema stripped a field it does not declare", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ id: "p_1", discount: 5 })),
    );

    const data = await executeRequest(
      { shop },
      { source: "shop", method: "product", variables: { id: "p_1" } },
    );

    expect(data).toEqual({ id: "p_1" });
    expect(shapes).toHaveBeenCalledWith(
      expect.objectContaining({
        shape: { "": "object", id: "string", discount: "number" },
        cut: false,
      }),
    );
  });

  it("is sent for no endpoint without a response schema, no error answer, and no call without Studio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "gone" }, { status: 404 })),
    );
    await expect(
      executeRequest({ shop }, { source: "shop", method: "product", variables: { id: "x" } }),
    ).rejects.toThrow();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ id: "1" })),
    );
    await executeRequest({ shop }, { source: "shop", method: "loose" });
    studioHooks.onRequestStart = undefined;
    await executeRequest({ shop }, { source: "shop", method: "product", variables: { id: "1" } });

    expect(shapes).not.toHaveBeenCalled();
  });
});

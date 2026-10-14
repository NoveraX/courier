/**
 * The answer Studio is handed, to read its shape and follow the contract's
 * drift: a 2xx answer of an endpoint with a response schema, as it came
 * back — before the schema strips what it does not declare — and nothing
 * else. Reading the shape is the work of Studio's runtime, so no app ships
 * the code for it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { courier, defineApi } from "../src/define";
import { studioHooks } from "../src/studio";
import { executeRequest } from "../src/utils/execute";

const { endpoint } = courier();

describe("the answer Studio is handed", () => {
  const shop = defineApi({
    baseURL: "https://shop.example",
    endpoints: {
      product: endpoint.get("products/:id").response(z.object({ id: z.string() })),
      loose: endpoint.get("loose"),
    },
  });
  const answers = vi.fn();

  beforeEach(() => {
    studioHooks.onRequestStart = vi.fn();
    studioHooks.onAnswer = answers;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    studioHooks.onRequestStart = undefined;
    studioHooks.onAnswer = undefined;
    answers.mockReset();
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
    expect(answers).toHaveBeenCalledWith(
      expect.objectContaining({ data: { id: "p_1", discount: 5 } }),
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

    expect(answers).not.toHaveBeenCalled();
  });
});

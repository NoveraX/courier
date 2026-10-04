/**
 * An endpoint whose variables are all optional — the paginated list, the most
 * common shape an API has.
 *
 * Its call signature makes the argument optional, so the call it invites —
 * with no argument — validates as an empty object, defaults applied, rather
 * than sending `undefined` to a schema that rejects it before any request
 * goes out.
 */
import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { validateVariablesSafe } from "../src/adapter/ws-middleware";
import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define/index";

const { endpoint } = courier();
const UPSTREAM = "https://upstream.example";

const api = defineApi({
  baseURL: UPSTREAM,
  groups: {
    items: defineGroup({
      endpoints: {
        zodOptional: endpoint
          .get("optional")
          .variables(z.object({ page: z.number().optional(), q: z.string().optional() }))
          .response<unknown>(),
        zodDefaulted: endpoint
          .get("defaulted")
          .variables(z.object({ page: z.number().default(1) }))
          .response<unknown>(),
        valibotOptional: endpoint
          .get("valibot")
          .variables(v.object({ page: v.optional(v.number()) }))
          .response<unknown>(),
      },
    }),
  },
});

const requested: string[] = [];

beforeEach(() => {
  requested.length = 0;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    requested.push(input instanceof Request ? input.url : String(input));
    return Response.json({ ok: true });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("calling with no argument", () => {
  it("succeeds for a zod schema of optional fields", async () => {
    await expect(createCaller(api).items.zodOptional()).resolves.toEqual({ ok: true });
    expect(requested).toEqual([`${UPSTREAM}/optional`]);
  });

  it("applies the schema's defaults", async () => {
    await createCaller(api).items.zodDefaulted();
    expect(requested).toEqual([`${UPSTREAM}/defaulted?page=1`]);
  });

  it("succeeds for a valibot schema of optional fields", async () => {
    await expect(createCaller(api).items.valibotOptional()).resolves.toEqual({ ok: true });
  });
});

describe("subscribing over WebSocket with no variables", () => {
  it("validates them as an empty object", async () => {
    const sendMessage = vi.fn();
    const schema = { variables: z.object({ room: z.string().default("lobby") }) };

    const result = await validateVariablesSafe(
      { sendMessage } as never,
      { type: "subscribe", id: "1" } as never,
      schema,
    );

    expect(result).toEqual({ room: "lobby" });
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

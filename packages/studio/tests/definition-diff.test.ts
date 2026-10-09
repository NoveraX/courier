/**
 * What a change to the definition does to its callers. For what a call
 * sends, a field it must now send or a value it may no longer send breaks
 * it; for what it gets back, a field gone or one that may now be missing
 * breaks it, and a value it did not get before may. An endpoint is matched
 * by its name, so a route that moved is a route changed.
 */
import { courier, defineApi } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { diffDefinitions } from "../src/commands/diff/definition-diff";
import { documentsOf } from "../src/commands/diff/definition-documents";

const { endpoint } = courier();

const Order = z.object({
  id: z.string(),
  status: z.enum(["open", "paid"]),
  total: z.number(),
  note: z.string().optional(),
});

const base = defineApi({
  baseURL: "https://shop.example",
  endpoints: {
    get: endpoint
      .get("orders/:id")
      .variables(z.object({ id: z.string() }))
      .response(Order),
    place: endpoint
      .post("orders")
      .variables(
        z.object({
          sku: z.string(),
          qty: z.number(),
          gift: z.boolean().optional(),
          coupon: z.string(),
        }),
      )
      .response(Order),
    list: endpoint
      .get("orders")
      .variables(z.object({ page: z.number().optional() }))
      .response(z.array(Order)),
    archive: endpoint.post("orders/:id/archive").variables(z.object({ id: z.string() })),
  },
});

const head = defineApi({
  baseURL: "https://shop.example",
  endpoints: {
    get: endpoint
      .get("orders/:id")
      .variables(z.object({ id: z.string() }))
      .response(
        Order.omit({ total: true }).extend({
          status: z.enum(["open", "paid", "refunded"]),
          note: z.string().nullable().optional(),
        }),
      ),
    place: endpoint
      .post("orders")
      .variables(
        z.object({
          sku: z.string(),
          qty: z.number().int(),
          gift: z.boolean(),
          currency: z.string(),
        }),
      )
      .response(Order.partial({ total: true })),
    list: endpoint
      .get("v2/orders")
      .variables(z.object({ page: z.number().optional(), shopper: z.string() }))
      .response(z.array(Order)),
    cancel: endpoint.post("orders/:id/cancel").variables(z.object({ id: z.string() })),
  },
});

const changed = diffDefinitions(documentsOf({ shop: base }), documentsOf({ shop: head }));
const of = (name: string) =>
  changed
    .find((entry) => entry.endpoint === name)
    ?.changes.map(({ severity, kind, place }) => [severity, kind, place]);

describe("a change to what a call sends", () => {
  it("breaks it when a field must now be sent, or a value may no longer be sent", () => {
    expect(of("place")).toEqual(
      expect.arrayContaining([
        ["breaking", "type-narrowed", "body.qty"],
        ["breaking", "field-required", "body.gift"],
        ["breaking", "field-added-required", "body.currency"],
        ["info", "field-removed", "body.coupon"],
      ]),
    );
    expect(of("list")).toEqual(
      expect.arrayContaining([["breaking", "parameter-added-required", "query.shopper"]]),
    );
  });
});

describe("a change to what a call gets back", () => {
  it("breaks it when a field is gone or may be missing, and may break it with values it did not get before", () => {
    expect(of("get")).toEqual(
      expect.arrayContaining([
        ["breaking", "field-removed", "answer.total"],
        ["warning", "type-widened", "answer.status"],
        ["warning", "type-widened", "answer.note"],
      ]),
    );
    expect(of("place")).toEqual(
      expect.arrayContaining([["breaking", "field-optional", "answer.total"]]),
    );
  });
});

describe("a change to the endpoints", () => {
  it("names an endpoint gone, a route moved and an endpoint new, the breaking ones first", () => {
    expect(of("archive")).toEqual([["breaking", "endpoint-removed", ""]]);
    expect(of("list")).toEqual(expect.arrayContaining([["breaking", "route-changed", ""]]));
    expect(of("cancel")).toEqual([["info", "endpoint-added", ""]]);
    expect(changed.at(-1)?.endpoint).toBe("cancel");
  });

  it("finds nothing between a definition and itself", () => {
    expect(diffDefinitions(documentsOf({ shop: base }), documentsOf({ shop: base }))).toEqual([]);
  });
});

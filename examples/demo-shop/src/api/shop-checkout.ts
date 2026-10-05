import { courier, defineGroup } from "@noverax/courier/define";
import { z } from "zod";

import { shopAuth } from "./middleware";
import { Account, Cart, Order } from "./schemas";

const { endpoint } = courier();
const secured = courier({ middleware: [shopAuth] });

const Shopper = z.object({ shopper: z.string().min(1) });

/** A shopper's cart, kept by the shop under the shopper's name. */
export const cart = defineGroup({
  prefix: "cart",
  endpoints: {
    get: endpoint.get(":shopper").variables(Shopper).response(Cart),
    add: endpoint
      .post(":shopper/items")
      .variables(Shopper.extend({ sku: z.string(), qty: z.number().int().min(1).max(9) }))
      .response(Cart),
    remove: endpoint
      .del(":shopper/items/:sku")
      .variables(Shopper.extend({ sku: z.string() }))
      .response(Cart),
  },
});

/** Orders, placed from a cart; each call carries the shop's service key. */
export const orders = defineGroup({
  prefix: "orders",
  endpoints: {
    list: secured.endpoint.get("").variables(Shopper).response(z.array(Order)),
    get: secured.endpoint
      .get(":id")
      .variables(z.object({ id: z.string() }))
      .response(Order),
    place: secured.endpoint.post("").variables(Shopper).response(Order),
    cancel: secured.endpoint
      .post(":id/cancel")
      .variables(z.object({ id: z.string() }))
      .response(Order),
  },
});

/** The account the service key belongs to. */
export const account = defineGroup({
  prefix: "account",
  endpoints: {
    me: secured.endpoint.get("").response(Account),
  },
});

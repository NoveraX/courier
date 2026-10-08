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
    get: endpoint
      .get(":shopper")
      .variables(Shopper)
      .response(Cart)
      .agent({ description: "A shopper's cart, by the shopper's name", access: "read" }),
    add: endpoint
      .post(":shopper/items")
      .variables(Shopper.extend({ sku: z.string(), qty: z.number().int().min(1).max(9) }))
      .response(Cart)
      .agent({
        description: "Put 1 to 9 of a product, by its SKU, in a shopper's cart",
        access: "write",
      }),
    remove: endpoint
      .del(":shopper/items/:sku")
      .variables(Shopper.extend({ sku: z.string() }))
      .response(Cart)
      .agent({
        description: "Take a product, by its SKU, out of a shopper's cart",
        access: "write",
      }),
  },
});

/** Orders, placed from a cart; each call carries the shop's service key. */
export const orders = defineGroup({
  prefix: "orders",
  endpoints: {
    list: secured.endpoint.get("").variables(Shopper).response(z.array(Order)).agent({
      description: "A shopper's orders, newest first, each with its status",
      access: "read",
    }),
    get: secured.endpoint
      .get(":id")
      .variables(z.object({ id: z.string() }))
      .response(Order)
      .agent({ description: "One order by its id: its items, total and status", access: "read" }),
    place: secured.endpoint
      .post("")
      .variables(Shopper)
      .response(Order)
      .agent({ description: "Place an order for everything in a shopper's cart", access: "write" }),
    cancel: secured.endpoint
      .post(":id/cancel")
      .variables(z.object({ id: z.string() }))
      .response(Order)
      .agent({ description: "Cancel an order that has not shipped yet", access: "destructive" }),
  },
});

/** The account the service key belongs to. */
export const account = defineGroup({
  prefix: "account",
  endpoints: {
    me: secured.endpoint.get("").response(Account),
  },
});

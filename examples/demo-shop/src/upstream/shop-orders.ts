import { z } from "zod";

import type { Account, Cart, Line } from "../api/schemas";
import { CATALOG } from "../catalog";
import { type Answer, chance, latency, NOT_FOUND, type UpstreamRequest } from "./http";
import { carts, moveOrder, orders, placeOrder } from "./shop-state";

const ACCOUNT: Account = { id: "acct_demo", name: "Demo Shop GmbH", plan: "growth" };

const NewLine = z.object({ sku: z.string(), qty: z.number().int().min(1).max(9) });
const Shopper = z.object({ shopper: z.string().min(1).max(60) });

/**
 * A shopper's cart: read it, add a product by SKU — refused when it is
 * unknown or sold out — or take one out.
 *
 * @param req - The request to `/cart/:shopper[/items[/:sku]]`
 * @returns The answer
 * @example
 * ```ts
 * await answerCart(request); // GET /cart/ada → [200, { shopper: "ada", items: [], total: 0 }]
 * ```
 */
export async function answerCart(req: UpstreamRequest): Promise<Answer> {
  const [, shopper, items, sku] = req.parts;
  if (!shopper || shopper.length > 60) return NOT_FOUND;
  await latency(20, 70);
  const lines = carts.get(shopper) ?? [];
  if (req.method === "GET" && !items) return [200, cartOf(shopper, lines)];
  if (items !== "items") return NOT_FOUND;
  if (req.method === "DELETE" && sku) {
    const kept = lines.filter((line) => line.sku !== sku);
    carts.set(shopper, kept);
    return [200, cartOf(shopper, kept)];
  }
  if (req.method !== "POST" || sku) return NOT_FOUND;
  const line = NewLine.safeParse(req.body);
  if (!line.success) return [400, { message: "A cart line needs a sku and a qty from 1 to 9" }];
  const product = CATALOG.find((p) => p.sku === line.data.sku);
  if (!product) return [404, { message: `No product has the SKU ${line.data.sku}` }];
  if (product.stock === 0) return [409, { message: `${product.name} is sold out` }];
  const added = [
    ...lines.filter((l) => l.sku !== product.sku),
    { ...line.data, price: product.price },
  ];
  carts.set(shopper, added.slice(-12));
  return [200, cartOf(shopper, added.slice(-12))];
}

/**
 * Orders: a shopper's list, one by id, one placed from the shopper's cart —
 * now and then an item sells out on the way — and one cancelled before it
 * ships.
 *
 * @param req - The request to `/orders[/:id[/cancel]]`, with a good service key
 * @returns The answer
 * @example
 * ```ts
 * await answerOrders(request); // POST /orders { shopper: "ada" } → [201, order]
 * ```
 */
export async function answerOrders(req: UpstreamRequest): Promise<Answer> {
  const [, id, action] = req.parts;
  if (req.method === "GET" && !id) {
    await latency(30, 90);
    const shopper = req.query.get("shopper");
    return [
      200,
      orders
        .values()
        .filter((order) => order.shopper === shopper)
        .slice(-20),
    ];
  }
  if (req.method === "POST" && !id) return place(req.body);
  const order = id ? orders.get(id) : undefined;
  if (!order) return [404, { message: `No order ${id}` }];
  if (req.method === "GET" && !action) return [200, order];
  if (req.method !== "POST" || action !== "cancel") return NOT_FOUND;
  if (order.status === "shipped") return [409, { message: `Order ${order.id} has shipped` }];
  return [200, order.status === "cancelled" ? order : moveOrder(order, "cancelled")];
}

/**
 * The account the service key belongs to.
 *
 * @returns The answer
 * @example
 * ```ts
 * await answerAccount(); // → [200, { id: "acct_demo", … }]
 * ```
 */
export async function answerAccount(): Promise<Answer> {
  await latency(15, 40);
  return [200, ACCOUNT];
}

async function place(body: unknown): Promise<Answer> {
  await latency(120, 380);
  const input = Shopper.safeParse(body);
  if (!input.success) return [400, { message: "An order needs the shopper who places it" }];
  const lines = carts.get(input.data.shopper) ?? [];
  if (lines.length === 0) return [422, { message: "The cart is empty" }];
  if (chance(0.08)) return [409, { message: "An item sold out while the order was placed" }];
  carts.set(input.data.shopper, []);
  return [201, placeOrder(input.data.shopper, lines)];
}

function cartOf(shopper: string, items: Line[]): Cart {
  return { shopper, items, total: items.reduce((sum, line) => sum + line.qty * line.price, 0) };
}

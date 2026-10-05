import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import type { Line, Order, OrderEvent, OrderStatus } from "../api/schemas";
import { anyProduct } from "../catalog";
import { BoundedMap } from "./bounded-map";
import { chance } from "./http";

/** How long a service key the shop issued is good for. */
export const KEY_LIFETIME_MS = 45_000;

const NEXT: Readonly<Partial<Record<OrderStatus, OrderStatus>>> = {
  placed: "paid",
  paid: "packed",
  packed: "shipped",
};

const keys = new BoundedMap<string, number>(200);

/** Each shopper's cart lines, by shopper. */
export const carts = new BoundedMap<string, Line[]>(500);

/** The orders placed, newest last. */
export const orders = new BoundedMap<string, Order>(500);

/** Order status changes as they happen, for the stream of orders. */
export const orderEvents = new EventEmitter<{ event: [OrderEvent] }>();
/* One listener a stream open: the shop's server and the Playground's visitors hold some. */
orderEvents.setMaxListeners(100);

/**
 * Issue a service key, good for {@link KEY_LIFETIME_MS}.
 *
 * @returns The key
 * @example
 * ```ts
 * const token = issueKey();
 * ```
 */
export function issueKey(): string {
  const token = `sk_shop_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  keys.set(token, Date.now());
  return token;
}

/**
 * Whether an Authorization header carries a key the shop issued that is still good.
 *
 * @param header - The request's Authorization header
 * @returns Whether the key is good
 * @example
 * ```ts
 * if (!keyIsGood(req.headers.authorization)) return [401, { message: "…" }];
 * ```
 */
export function keyIsGood(header: string | undefined): boolean {
  const issuedAt = keys.get(header?.replace(/^Bearer /, "") ?? "");
  return issuedAt !== undefined && Date.now() - issuedAt < KEY_LIFETIME_MS;
}

/**
 * Place an order for a shopper's lines, and tell the stream of orders.
 *
 * @param shopper - Who places it
 * @param items - What it holds
 * @returns The order
 * @example
 * ```ts
 * const order = placeOrder("ada", carts.get("ada") ?? []);
 * ```
 */
export function placeOrder(shopper: string, items: Line[]): Order {
  const order: Order = {
    id: `o_${randomUUID().slice(0, 8)}`,
    shopper,
    status: "placed",
    items,
    total: items.reduce((sum, line) => sum + line.qty * line.price, 0),
    placedAt: new Date().toISOString(),
  };
  orders.set(order.id, order);
  tell(order);
  return order;
}

/**
 * Move an order to a status, and tell the stream of orders.
 *
 * @param order - The order
 * @param status - Where it is now
 * @returns The order as it is now
 * @example
 * ```ts
 * moveOrder(order, "cancelled");
 * ```
 */
export function moveOrder(order: Order, status: OrderStatus): Order {
  const moved = { ...order, status };
  orders.set(order.id, moved);
  tell(moved);
  return moved;
}

/**
 * Keep the orders moving: now and then another shopper places one, and
 * each order not yet shipped may move a step. The shop runs this for as
 * long as it is up.
 *
 * @returns Stops the orders moving
 * @example
 * ```ts
 * const stop = keepOrdersMoving();
 * ```
 */
export function keepOrdersMoving(): () => void {
  const timer = setInterval(() => {
    if (chance(0.4)) {
      const { sku, price } = anyProduct();
      placeOrder(`shopper-${Math.floor(Math.random() * 900) + 100}`, [{ sku, qty: 1, price }]);
    }
    for (const order of orders.values().slice(-30)) {
      const next = NEXT[order.status];
      if (next && chance(0.25)) moveOrder(order, next);
    }
  }, 2_500);
  timer.unref();
  return () => clearInterval(timer);
}

function tell(order: Order): void {
  orderEvents.emit("event", {
    orderId: order.id,
    status: order.status,
    at: new Date().toISOString(),
  });
}

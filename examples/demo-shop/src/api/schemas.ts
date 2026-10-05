import { z } from "zod";

/** What the shop sells. */
export const Product = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
  category: z.enum(["audio", "desk", "travel", "home"]),
  price: z.number().min(1),
  currency: z.literal("EUR"),
  rating: z.number().min(1).max(5),
  stock: z.number().int().min(0),
});
export type Product = z.infer<typeof Product>;

/** What a buyer said of a product. */
export const Review = z.object({
  id: z.string(),
  productId: z.string(),
  author: z.string(),
  rating: z.number().int().min(1).max(5),
  text: z.string(),
});
export type Review = z.infer<typeof Review>;

/** A line of a cart or an order. */
export const Line = z.object({
  sku: z.string(),
  qty: z.number().int().min(1).max(9),
  price: z.number().min(1),
});
export type Line = z.infer<typeof Line>;

/** A shopper's cart. */
export const Cart = z.object({
  shopper: z.string(),
  items: z.array(Line),
  total: z.number().min(0),
});
export type Cart = z.infer<typeof Cart>;

/** Where an order is. */
export const OrderStatus = z.enum(["placed", "paid", "packed", "shipped", "cancelled"]);
export type OrderStatus = z.infer<typeof OrderStatus>;

/** An order a shopper placed. */
export const Order = z.object({
  id: z.string(),
  shopper: z.string(),
  status: OrderStatus,
  items: z.array(Line),
  total: z.number().min(0),
  placedAt: z.string(),
});
export type Order = z.infer<typeof Order>;

/** An order moving on, as the shop streams it. */
export const OrderEvent = z.object({
  orderId: z.string(),
  status: OrderStatus,
  at: z.string(),
});
export type OrderEvent = z.infer<typeof OrderEvent>;

/** The account the shop's service key belongs to. */
export const Account = z.object({
  id: z.string(),
  name: z.string(),
  plan: z.enum(["starter", "growth", "scale"]),
});
export type Account = z.infer<typeof Account>;

/** A price cut for a few minutes, as the shop's own server streams them. */
export const Deal = z.object({
  sku: z.string(),
  name: z.string(),
  percentOff: z.number().int().min(5).max(50),
  endsAt: z.string(),
});
export type Deal = z.infer<typeof Deal>;

/** A line of the support chat. */
export const SupportMessage = z.object({
  from: z.enum(["you", "support", "a shopper"]),
  text: z.string(),
});
export type SupportMessage = z.infer<typeof SupportMessage>;

/** A charge the payments provider made, or declined. */
export const Charge = z.object({
  id: z.string(),
  orderId: z.string(),
  amount: z.number().min(0),
  currency: z.literal("EUR"),
  status: z.enum(["succeeded", "refunded"]),
});
export type Charge = z.infer<typeof Charge>;

/** Money given back for a charge. */
export const Refund = z.object({
  id: z.string(),
  chargeId: z.string(),
  amount: z.number().min(0),
});
export type Refund = z.infer<typeof Refund>;

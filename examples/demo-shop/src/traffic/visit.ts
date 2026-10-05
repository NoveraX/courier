import { attempt } from "./attempt";
import { backend, storefront } from "./callers";
import { chance, pause, pick, pickSome } from "./random";

const QUERIES = ["desk", "lamp", "bag", "speaker", "kettle", "travel"];

/**
 * One shopper's visit: the catalog, a few products — the grid asks for each
 * card on its own, the N+1 Studio's audit points out — a search now and
 * then, reviews, the cart, and often a checkout.
 *
 * @param shopper - Who visits
 * @returns When the visit is over
 * @example
 * ```ts
 * await visit("ada");
 * ```
 */
export async function visit(shopper: string): Promise<void> {
  const products = (await attempt(() => storefront.products.list({}))) ?? [];
  if (products.length === 0) return;
  for (const product of pickSome(products, 4)) {
    await attempt(() => storefront.products.get({ id: product.id }));
  }
  await pause(400, 1_200);
  if (chance(0.35)) await attempt(() => storefront.products.search({ q: pick(QUERIES) }));
  if (chance(0.12)) await attempt(() => storefront.products.get({ id: "p_99" }));
  const chosen = pick(products);
  await attempt(() => storefront.products.reviews({ id: chosen.id }));
  await pause(500, 1_500);
  const qty = 1 + Math.floor(Math.random() * 2);
  await attempt(() => storefront.cart.add({ shopper, sku: chosen.sku, qty }));
  if (chance(0.5))
    await attempt(() => storefront.cart.add({ shopper, sku: pick(products).sku, qty: 1 }));
  const cart = await attempt(() => storefront.cart.get({ shopper }));
  await pause(500, 1_500);
  const first = cart?.items[0];
  if (!first) return;
  if (chance(0.25)) {
    await attempt(() => storefront.cart.remove({ shopper, sku: first.sku }));
    return;
  }
  await checkout(shopper);
}

/* The order through the shop's server, the charge from server code, as a checkout handler makes it. */
async function checkout(shopper: string): Promise<void> {
  const order = await attempt(() => storefront.orders.place({ shopper }));
  if (!order) return;
  const charge = await attempt(() =>
    backend.payments.charges.create({ orderId: order.id, amount: order.total }),
  );
  if (!charge) {
    await attempt(() => storefront.orders.cancel({ id: order.id }));
    return;
  }
  if (chance(0.1)) await attempt(() => backend.payments.refunds.create({ chargeId: charge.id }));
  await pause(500, 1_500);
  await attempt(() => storefront.orders.list({ shopper }));
  await attempt(() => storefront.orders.get({ id: order.id }));
}

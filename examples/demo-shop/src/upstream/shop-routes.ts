import type { Product, Review } from "../api/schemas";
import { CATALOG } from "../catalog";
import { type Answer, latency, NOT_FOUND, type UpstreamRequest } from "./http";
import { answerAccount, answerCart, answerOrders } from "./shop-orders";
import { issueKey, KEY_LIFETIME_MS, keyIsGood } from "./shop-state";

const AUTHORS = ["Mira", "Jonas", "Aiko", "Tomás", "Leah", "Kwame", "Sofia", "Ravi"];
const SAYINGS = [
  "Does what it says, and well made.",
  "Arrived in two days, packed with care.",
  "Good value for the price.",
  "Nicer in person than in the photos.",
  "Returned it once, the second one was fine.",
];

/**
 * The shop's REST backend: a catalog anyone may read, carts by shopper,
 * and orders and the account behind a service key that lasts 45 s.
 *
 * @param req - The request
 * @returns The answer
 * @example
 * ```ts
 * await answerShop(request); // GET /products → [200, [...]]
 * ```
 */
export async function answerShop(req: UpstreamRequest): Promise<Answer> {
  const [area, id] = req.parts;
  if (area === "auth" && id === "token" && req.method === "POST") {
    return [200, { token: issueKey(), expiresIn: KEY_LIFETIME_MS / 1000 }];
  }
  if (area === "products" && req.method === "GET") return answerProducts(req);
  if (area === "cart") return answerCart(req);
  if (area !== "orders" && area !== "account") return NOT_FOUND;
  if (!keyIsGood(req.headers.authorization)) {
    return [401, { message: "The service key is missing or has expired" }];
  }
  if (area === "account" && req.method === "GET" && !id) return answerAccount();
  return area === "orders" ? answerOrders(req) : NOT_FOUND;
}

async function answerProducts(req: UpstreamRequest): Promise<Answer> {
  const [, id, more] = req.parts;
  if (id === "search") {
    await latency(150, 450);
    const q = (req.query.get("q") ?? "").toLowerCase();
    return [200, CATALOG.filter((p) => p.name.toLowerCase().includes(q))];
  }
  await latency(25, 90);
  if (!id) {
    const category = req.query.get("category");
    return [200, category ? CATALOG.filter((p) => p.category === category) : CATALOG];
  }
  const product = CATALOG.find((p) => p.id === id);
  if (!product) return [404, { message: `No product ${id}` }];
  if (!more) return [200, product];
  return more === "reviews" ? [200, reviewsOf(product)] : NOT_FOUND;
}

/* Two to four reviews a product, the same each time it is asked. */
function reviewsOf(product: Product): Review[] {
  const seed = Number(product.id.slice(2));
  return Array.from({ length: 2 + (seed % 3) }, (_, n) => ({
    id: `r_${product.id}_${n + 1}`,
    productId: product.id,
    author: AUTHORS[(seed + n * 3) % AUTHORS.length] ?? "A buyer",
    rating: 3 + ((seed + n) % 3),
    text: SAYINGS[(seed * 7 + n) % SAYINGS.length] ?? "",
  }));
}

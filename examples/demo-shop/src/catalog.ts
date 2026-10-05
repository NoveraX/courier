import type { Product } from "./api/schemas";

type Category = Product["category"];

/* Name, category, price in euros, stock: a small shop's range. */
const RANGE: ReadonlyArray<readonly [string, Category, number, number]> = [
  ["Noise-cancelling headphones", "audio", 249, 14],
  ["Bookshelf speakers", "audio", 189, 6],
  ["USB microphone", "audio", 119, 22],
  ["Earbuds with case", "audio", 89, 0],
  ["Standing desk", "desk", 549, 3],
  ["Mechanical keyboard", "desk", 139, 31],
  ["Monitor arm", "desk", 79, 12],
  ["Desk lamp", "desk", 59, 40],
  ["Cabin suitcase", "travel", 219, 8],
  ["Packing cubes", "travel", 35, 64],
  ["Travel adapter", "travel", 29, 120],
  ["Weekender bag", "travel", 159, 5],
  ["Pour-over kettle", "home", 69, 18],
  ["Linen throw", "home", 95, 11],
  ["Ceramic planter", "home", 42, 27],
  ["Wall clock", "home", 55, 9],
];

/**
 * What the shop sells: sixteen products in four categories, one of them
 * sold out, each with a stable id and SKU.
 */
export const CATALOG: readonly Product[] = RANGE.map(([name, category, price, stock], n) => ({
  id: `p_${String(n + 1).padStart(2, "0")}`,
  sku: `${category.slice(0, 2).toUpperCase()}-${1000 + n * 7}`,
  name,
  category,
  price,
  currency: "EUR",
  rating: Math.round((3.6 + ((n * 37) % 14) / 10) * 10) / 10,
  stock,
}));

/**
 * A product of the catalog, picked at random.
 *
 * @returns The product
 * @example
 * ```ts
 * const { sku } = anyProduct();
 * ```
 */
export function anyProduct(): Product {
  const product = CATALOG[Math.floor(Math.random() * CATALOG.length)];
  if (!product) throw new Error("The catalog is empty");
  return product;
}

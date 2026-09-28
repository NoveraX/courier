import { fitNumber } from "./fit-number";
import { pseudoRandom, roundTo } from "./gen-helpers";
import type { FieldMeta } from "./schema-introspect";

/** Generate a realistic number value based on field name heuristics and schema constraints */
export function generateNumber(key: string, index: number, meta: FieldMeta): number {
  // A declared range (e.g. z.number().min(0).max(100)) spreads values across it
  if (meta.min !== undefined && meta.max !== undefined) {
    return fitNumber(roundTo(meta.min + pseudoRandom(index) * (meta.max - meta.min), 2), meta);
  }
  return fitNumber(heuristicNumber(key, index), meta);
}

function heuristicNumber(key: string, index: number): number {
  const lower = key.toLowerCase();

  // Identity — sequential
  if (lower === "id" || lower.endsWith("id") || lower.endsWith("_id")) return index;

  // Money
  if (matchesAny(lower, "price", "cost", "amount", "total", "subtotal", "fee", "charge")) {
    return roundTo(9.99 + pseudoRandom(index) * 290, 2);
  }
  if (lower === "discount") return roundTo(pseudoRandom(index) * 50, 2);
  if (lower === "tax") return roundTo(pseudoRandom(index) * 30, 2);

  // Ratings / scores
  if (lower === "rating" || lower === "score" || lower === "stars") return (index % 5) + 1;

  // Quantity
  if (matchesAny(lower, "quantity", "qty", "count", "stock")) {
    return Math.floor(pseudoRandom(index) * 100) + 1;
  }

  // Age / years
  if (lower === "age") return 18 + (index % 60);
  if (lower === "year") return 2020 + (index % 6);

  // Percentages
  if (lower.includes("percent") || lower.includes("rate") || lower === "progress") {
    return Math.round(pseudoRandom(index) * 100);
  }

  // Measurements
  if (matchesAny(lower, "weight", "height", "width", "length", "depth")) {
    return roundTo(1 + pseudoRandom(index) * 100, 1);
  }

  // Coordinates
  if (lower === "latitude" || lower === "lat") return roundTo(-90 + pseudoRandom(index) * 180, 6);
  if (lower === "longitude" || lower === "lng" || lower === "lon")
    return roundTo(-180 + pseudoRandom(index) * 360, 6);

  // Duration
  if (matchesAny(lower, "duration", "timeout", "delay")) return ((index % 10) + 1) * 1000;

  // Order / position
  if (matchesAny(lower, "order", "position", "index", "sort", "rank")) return index;

  // Port
  if (lower === "port") return 3000 + index;

  return index;
}

/** Check if key matches or includes any of the given terms */
function matchesAny(lower: string, ...terms: string[]): boolean {
  return terms.some((t) => lower === t || lower.includes(t));
}

/**
 * Schema-based fake data generator.
 *
 * Produces realistic, deterministic mock data by combining:
 * 1. Schema introspection (types, enums, constraints, nested shapes)
 * 2. Field-name heuristics (e.g. "email" → valid email format)
 * 3. Curated dictionaries for natural-looking values
 *
 * Supports: nested objects, typed arrays, tuples, records, unions,
 * discriminated unions, literals, defaults, and all primitive types.
 * Depth-limited to handle self-referencing schemas safely.
 *
 * Zero external dependencies — no faker.js.
 */

export type { EntityContext } from "./context";
export { generateRecord, generateRecords } from "./records";

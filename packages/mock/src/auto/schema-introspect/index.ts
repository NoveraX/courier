/**
 * Schema introspection — extracts type information from Zod (v3/v4) and Valibot schemas.
 * Supports: primitives, arrays, objects, tuples, records, enums, literals,
 * unions, discriminated unions, optional/nullable, defaults, transforms, and lazy schemas.
 */

export { analyzeField } from "./analyze";
export { extractPaginatedItemSchema, extractShape, unwrapArraySchema } from "./extract";
export type { FieldMeta, FieldType } from "./types";

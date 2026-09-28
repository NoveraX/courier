/**
 * Type-safe property accessor for opaque schema objects.
 * Avoids `any` casts when reading from Zod v3, Zod v4, and Valibot internals.
 */

/** Read a nested property path from an unknown object */
export function prop(obj: unknown, ...path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = Reflect.get(current, key);
  }
  return current;
}

/** Read from Zod v4 (_zod.def), then Zod v3/alt (_def), then direct (Valibot) */
export function readDef(field: unknown, zodKey: string, valibotKey?: string): unknown {
  return (
    prop(field, "_zod", "def", zodKey) ??
    prop(field, "_def", zodKey) ??
    (valibotKey ? prop(field, valibotKey) : undefined)
  );
}

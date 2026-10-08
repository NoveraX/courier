import type { Drift } from "./endpoint-drift";

/** A change a response schema needs to take its endpoint's real answers. */
export interface SchemaFix {
  /** The object the field belongs to: `""` for the answer, `seller`, `items[]` */
  within: string;
  /** The field's declaration, as the schema's library writes it: `rating: z.number().optional()` */
  line: string;
}

const ZOD: Readonly<Record<string, string>> = {
  string: "z.string()",
  number: "z.number()",
  boolean: "z.boolean()",
  object: "z.object({})",
  array: "z.array(z.unknown())",
};

/**
 * The fields a response schema should declare so its endpoint's answers fit
 * it: a field it does not name, as the types it came as — optional when not
 * every answer held it, nullable when it came as `null` — a field that came
 * as another type, as that type — or the union with the declared one when
 * some answers still came as it — and a required field some answers
 * lacked, made optional — an object or a list as it is declared, `…`. Written for Zod when the schema is a Zod
 * schema, else as the JSON types.
 *
 * @param drift - How the answers differ from the schema
 * @param calls - How many answers were seen
 * @param vendor - The schema's library, as Standard Schema names it
 * @returns The fields to declare, each in the object it belongs to
 * @example
 * ```ts
 * schemaFix([{ path: "rating", kind: "undeclared", observed: ["number"], count: 3, … }], 4, "zod");
 * // [{ within: "", line: "rating: z.number().optional()" }]
 * ```
 */
export function schemaFix(
  drift: readonly Drift[],
  calls: number,
  vendor: string | undefined,
): SchemaFix[] {
  return drift.flatMap((difference) => {
    const { within, key } = splitPath(difference.path);
    if (key === undefined) return [];
    const types =
      difference.kind === "type" && difference.alsoFits
        ? [...new Set([...(difference.declared ?? []), ...difference.observed])]
        : difference.observed;
    const optional =
      difference.kind === "missing" ||
      (difference.kind === "undeclared" && difference.count < calls);
    /* A missing object or list keeps its declaration, made optional: only the scalars are written whole. */
    const kept =
      difference.kind === "missing" && types.some((type) => type === "object" || type === "array");
    if (kept)
      return [{ within, line: `${key}: …${vendor === "zod" ? ".optional()" : ", optional"}` }];
    return [
      {
        within,
        line: `${key}: ${vendor === "zod" ? zodOf(types, optional) : jsonOf(types, optional)}`,
      },
    ];
  });
}

function zodOf(types: readonly string[], optional: boolean): string {
  const values = types.filter((type) => type !== "null" && type !== "any");
  const nullable = types.includes("null");
  const written = values.map((type) => ZOD[type] ?? "z.unknown()");
  const base =
    written.length === 0
      ? "z.null()"
      : written.length === 1
        ? (written[0] ?? "z.unknown()")
        : `z.union([${written.join(", ")}])`;
  return `${base}${nullable && written.length > 0 ? ".nullable()" : ""}${optional ? ".optional()" : ""}`;
}

function jsonOf(types: readonly string[], optional: boolean): string {
  return `${types.filter((type) => type !== "any").join(" | ") || "unknown"}${optional ? ", optional" : ""}`;
}

/* `seller.rating` → within `seller`, key `rating`; an array's items are an object's place too. */
function splitPath(path: string): { within: string; key: string | undefined } {
  if (path === "" || path.endsWith("[]")) return { within: path, key: undefined };
  const dot = path.lastIndexOf(".");
  return dot === -1
    ? { within: "", key: path }
    : { within: path.slice(0, dot), key: path.slice(dot + 1) };
}

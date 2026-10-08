/** A JSON value's type, as an answer's shape names it. */
export type ShapeType = "string" | "number" | "boolean" | "null" | "object" | "array";

/** An answer's shape: each place in it with the JSON types seen there, and whether the walk stopped short. */
export interface AnswerShape {
  /** `""` for the answer itself, `user.id`, `items[].price`; types joined by `|`: `null|string` */
  readonly shape: Readonly<Record<string, string>>;
  /** The answer was larger or deeper than a shape walks, so a part of it is not in the shape */
  readonly cut: boolean;
}

/* A shape describes an answer; it never costs what reading the answer did. */
const MOST_PLACES = 1000;
const DEEPEST = 16;
/* An array's items share a shape; the first ones say it. */
const ITEMS_READ = 20;

/**
 * The shape of an answer as it came back, before a schema read it: each
 * place in it — `user.id`, `items[].price` — with the JSON types seen
 * there, an array's items merged. Studio sets it beside the endpoint's
 * response schema to find the fields the schema does not declare and the
 * types it does not expect, which a schema that strips unknown fields
 * leaves no trace of in the answer the app gets. It is bounded — so many
 * places, so deep, an array's first items — and says when it stopped short.
 *
 * @param value - The answer's body, parsed
 * @returns Its shape
 * @example
 * ```ts
 * answerShapeOf({ id: "p_1", tags: ["a", null] }).shape; // { "": "object", id: "string", tags: "array", "tags[]": "null|string" }
 * ```
 */
export function answerShapeOf(value: unknown): AnswerShape {
  const types = new Map<string, Set<ShapeType>>();
  let places = 0;
  let cut = false;
  const visit = (node: unknown, path: string, depth: number): void => {
    if (places >= MOST_PLACES || depth > DEEPEST) {
      cut = true;
      return;
    }
    places++;
    const type = shapeTypeOf(node);
    const seen = types.get(path) ?? new Set<ShapeType>();
    seen.add(type);
    types.set(path, seen);
    if (Array.isArray(node)) {
      for (const item of node.slice(0, ITEMS_READ)) visit(item, `${path}[]`, depth + 1);
    } else if (typeof node === "object" && node !== null) {
      const entries: Array<[string, unknown]> = Object.entries(node);
      for (const [key, inner] of entries) {
        visit(inner, path === "" ? key : `${path}.${key}`, depth + 1);
      }
    }
  };
  visit(value, "", 0);
  const shape = Object.fromEntries(
    [...types].map(([path, seen]) => [path, [...seen].sort().join("|")]),
  );
  return { shape, cut };
}

function shapeTypeOf(value: unknown): ShapeType {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "object";
}

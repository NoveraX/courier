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

/* Each type a bit, in the order the names sort in, so a place's types read out sorted. */
const TYPE_NAMES: readonly ShapeType[] = ["array", "boolean", "null", "number", "object", "string"];
const TYPE_BIT: Readonly<Record<ShapeType, number>> = {
  array: 1,
  boolean: 2,
  null: 4,
  number: 8,
  object: 16,
  string: 32,
};
const TYPES_OF_BITS: readonly string[] = Array.from({ length: 64 }, (_, bits) =>
  TYPE_NAMES.filter((_, at) => (bits & (1 << at)) !== 0).join("|"),
);

/** A place in an answer, with what was seen there. */
interface Place {
  /** The types seen here, a bit each; none for a place the walk stopped short of */
  types: number;
  /** When the walk first reached it: the shape lists places in that order */
  order: number;
  /** Its fields by name, when it held an object */
  fields?: Map<string, Place>;
  /** Its items, merged, when it held an array */
  items?: Place;
}

/**
 * The shape of an answer as it came back, before a schema read it: each
 * place in it — `user.id`, `items[].price` — with the JSON types seen
 * there, an array's items merged. Studio sets it beside the endpoint's
 * response schema to find the fields the schema does not declare and the
 * types it does not expect, which a schema that strips unknown fields
 * leaves no trace of in the answer the app gets. It is bounded — so many
 * places, so deep, an array's first items — and says when it stopped short.
 *
 * The walk names no place until it is done: the items of an array share
 * one place, and a place's name is spelled once, however many items reach
 * it.
 *
 * @param value - The answer's body, parsed
 * @returns Its shape
 * @example
 * ```ts
 * answerShapeOf({ id: "p_1", tags: ["a", null] }).shape; // { "": "object", id: "string", tags: "array", "tags[]": "null|string" }
 * ```
 */
export function answerShapeOf(value: unknown): AnswerShape {
  const root: Place = { types: 0, order: 0 };
  let visits = 0;
  let reached = 0;
  let cut = false;
  const visit = (node: unknown, place: Place, depth: number): void => {
    if (visits >= MOST_PLACES || depth > DEEPEST) {
      cut = true;
      return;
    }
    visits++;
    if (place.types === 0) place.order = reached++;
    place.types |= TYPE_BIT[shapeTypeOf(node)];
    if (Array.isArray(node)) {
      place.items ??= { types: 0, order: 0 };
      const count = Math.min(node.length, ITEMS_READ);
      for (let at = 0; at < count; at++) visit(node[at], place.items, depth + 1);
    } else if (typeof node === "object" && node !== null) {
      place.fields ??= new Map();
      for (const key of Object.keys(node)) {
        visit(Reflect.get(node, key), fieldOf(place.fields, key), depth + 1);
      }
    }
  };
  visit(value, root, 0);
  return { shape: Object.fromEntries(placesOf(root)), cut };
}

function fieldOf(fields: Map<string, Place>, key: string): Place {
  let field = fields.get(key);
  if (field === undefined) {
    field = { types: 0, order: 0 };
    fields.set(key, field);
  }
  return field;
}

/*
 * Every place the walk reached, named, with its types, in the order it
 * reached them. Two places a name cannot tell apart — a field named `""`
 * beside the answer itself, a field named `a.b` beside `b` inside `a` — are
 * one place in the shape, with the types of both.
 */
function placesOf(root: Place): Array<[string, string]> {
  const named = new Map<string, { types: number; order: number }>();
  const list = (place: Place, path: string): void => {
    if (place.types === 0) return;
    const known = named.get(path);
    if (known === undefined) named.set(path, { types: place.types, order: place.order });
    else {
      known.types |= place.types;
      known.order = Math.min(known.order, place.order);
    }
    if (place.items) list(place.items, `${path}[]`);
    if (!place.fields) return;
    for (const [key, field] of place.fields) list(field, path === "" ? key : `${path}.${key}`);
  };
  list(root, "");
  return [...named]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([path, place]) => [path, TYPES_OF_BITS[place.types] ?? ""]);
}

function shapeTypeOf(value: unknown): ShapeType {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "object";
}

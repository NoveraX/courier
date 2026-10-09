import type { EndpointSeen, FieldSeen } from "../storage/answer-observations";
import type { DeclaredShape } from "./declared-shape";

/** How an endpoint's real answers stand against its response schema. */
export type ContractState = "confirmed" | "drifted" | "unobserved";

/** A way the answers differ from what the schema declares. */
export interface Drift {
  /** `user.rating`, `items[].price`; `""` for the answer itself */
  path: string;
  /**
   * `undeclared` — a field the schema does not name, which it drops;
   * `type` — a type the schema does not take there;
   * `missing` — a field the schema requires, absent from some answers.
   */
  kind: "undeclared" | "type" | "missing";
  /** The types seen there */
  observed: string[];
  /** The types the schema takes there, for `type` */
  declared?: string[] | undefined;
  /** For `type`: whether some answers came as a type the schema takes */
  alsoFits?: boolean | undefined;
  firstSeen: number;
  lastSeen: number;
  /** In how many answers it was seen as it differs — or, for `missing`, how many lacked it */
  count: number;
  places: string[];
}

/**
 * Set what an endpoint's answers were seen to hold beside what its response
 * schema declares: each field the schema does not name — under an object
 * that does not take unnamed keys, the outermost one only — each type the
 * schema does not take, and each required field some answers lacked. An
 * endpoint with no answer seen is unobserved; one whose answers all fit is
 * confirmed by its traffic.
 *
 * @param seen - What its answers held, or `undefined` while none was seen
 * @param declared - What its response schema declares
 * @returns Its state, and how its answers differ
 * @example
 * ```ts
 * const { state, drift } = endpointDrift(observations.of("shop", "products.get"), declaredShapeOf(json));
 * ```
 */
export function endpointDrift(
  seen: EndpointSeen | undefined,
  declared: DeclaredShape,
): { state: ContractState; drift: Drift[] } {
  if (!seen || seen.calls === 0) return { state: "unobserved", drift: [] };
  const byPath = new Map<string, FieldSeen[]>();
  for (const field of seen.fields)
    byPath.set(field.path, [...(byPath.get(field.path) ?? []), field]);
  const drift: Drift[] = [];
  for (const [path, fields] of byPath) {
    const found = differenceAt(path, fields, declared);
    if (found) drift.push(found);
  }
  drift.push(...missingFields(seen, declared, byPath));
  return { state: drift.length > 0 ? "drifted" : "confirmed", drift };
}

function differenceAt(
  path: string,
  fields: FieldSeen[],
  declared: DeclaredShape,
): Drift | undefined {
  const place = declared.places.get(declaredPath(path, declared));
  if (!place) {
    const parent = parentOf(path);
    const holder =
      parent === undefined ? undefined : declared.places.get(declaredPath(parent, declared));
    /* Only the outermost field the schema does not name: what lies inside it is part of it. */
    if (!holder || holder.open || holder.types.has("any")) return undefined;
    return { ...summed(path, fields), kind: "undeclared" };
  }
  if (place.types.has("any")) return undefined;
  const odd = fields.filter((field) => !place.types.has(field.type));
  if (odd.length === 0) return undefined;
  return {
    ...summed(path, odd),
    kind: "type",
    declared: [...place.types].sort(),
    alsoFits: odd.length < fields.length,
  };
}

/* A required field, under required objects only, that fewer answers held than held the object it is in: one absent with its object is its object's to be missing. */
function missingFields(
  seen: EndpointSeen,
  declared: DeclaredShape,
  byPath: Map<string, FieldSeen[]>,
): Drift[] {
  const missing: Drift[] = [];
  for (const [path, place] of declared.places) {
    if (path === "" || !place.required || path.includes("[]") || path.includes("*")) continue;
    if (!requiredAncestors(path, declared)) continue;
    const held = (byPath.get(path) ?? []).reduce((sum, field) => sum + field.count, 0);
    const holders = holdersOf(parentOf(path) ?? "", seen, byPath);
    if (held >= holders) continue;
    missing.push({
      path,
      kind: "missing",
      observed: (byPath.get(path) ?? []).map((field) => field.type).sort(),
      firstSeen: seen.firstSeen,
      lastSeen: seen.lastSeen,
      count: holders - held,
      places: [],
    });
  }
  return missing;
}

/* The answers a field could have been in: every one for a field of the answer, those that held its object for one inside it. */
function holdersOf(parent: string, seen: EndpointSeen, byPath: Map<string, FieldSeen[]>): number {
  if (parent === "") return seen.calls;
  return (byPath.get(parent) ?? [])
    .filter((field) => field.type === "object")
    .reduce((sum, field) => sum + field.count, 0);
}

function requiredAncestors(path: string, declared: DeclaredShape): boolean {
  for (
    let parent = parentOf(path);
    parent !== undefined && parent !== "";
    parent = parentOf(parent)
  ) {
    if (!declared.places.get(parent)?.required) return false;
  }
  return true;
}

function summed(path: string, fields: readonly FieldSeen[]): Omit<Drift, "kind"> {
  return {
    path,
    observed: fields.map((field) => field.type).sort(),
    firstSeen: Math.min(...fields.map((field) => field.firstSeen)),
    lastSeen: Math.max(...fields.map((field) => field.lastSeen)),
    count: Math.max(...fields.map((field) => field.count)),
    places: [...new Set(fields.flatMap((field) => field.places))],
  };
}

/* A record's keys are data: `prices.eur` is declared as `prices.*`, an item's `[]` kept. */
function declaredPath(path: string, declared: DeclaredShape): string {
  if (declared.maps.size === 0 || path === "") return path;
  const out: string[] = [];
  for (const segment of path.split(".")) {
    const items = /(?:\[\])*$/.exec(segment)?.[0] ?? "";
    out.push(declared.maps.has(out.join(".")) ? `*${items}` : segment);
  }
  return out.join(".");
}

function parentOf(path: string): string | undefined {
  if (path === "") return undefined;
  if (path.endsWith("[]")) return path.slice(0, -2);
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(0, dot);
}

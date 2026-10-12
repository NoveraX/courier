/**
 * The names of the types extracted from an import's endpoints.
 *
 * Named after the endpoint alone, an extracted type could take the name of
 * a schema the specification declares — which then replaced it, so an
 * endpoint's variables and response were typed and validated as that other
 * schema — or the name of another group's type, which the barrel could
 * export only once.
 */

import { toSafeIdentifier } from "../parser/naming-utils";
import { isTopLevel } from "../parser/top-level";
import type { ParsedEndpoint, ParsedGroup, ParsedSchema } from "../parser/types";
import { bodyToExtract, paramsToExtract, responseToExtract } from "./extract-endpoint-types";

/** What an extracted type describes. */
export type ExtractedKind = "Response" | "Params" | "Body";

/** A name JavaScript reads as an identifier: letters, digits, `_` and `$`, no digit first. */
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

const EXTRACTORS: Readonly<Record<ExtractedKind, (ep: ParsedEndpoint) => ParsedSchema | null>> = {
  Response: responseToExtract,
  Params: (ep) => paramsToExtract(ep),
  Body: bodyToExtract,
};

/** The name each extracted type takes. */
export interface ExtractedTypeNames {
  /**
   * The name of one endpoint's extracted type.
   *
   * @param group - The group's name
   * @param endpoint - The endpoint's name
   * @param kind - What the type describes
   * @returns Its name
   */
  nameOf: (group: string, endpoint: string, kind: ExtractedKind) => string;
}

/**
 * Decide the name of every type extracted from an import's endpoints.
 *
 * A type is named after its endpoint, `ListItemsResponse`, unless another
 * type of the import would take that name too or a schema of the
 * specification has it; it is then qualified by its group,
 * `ItemsListItemsResponse` — by `Api` for an endpoint of the API itself —
 * and numbered if that is taken as well. The whole import is named at once,
 * whatever is selected, so an endpoint added later is named as it would
 * have been from the start. An endpoint whose name is no identifier once
 * capitalised — an operation `3d` — is named by the identifier made of it,
 * `_3dResponse`, as is a group's.
 *
 * @param groups - Every group of the import, as it is generated
 * @param declared - The names of the specification's own schemas
 * @returns The names
 * @example
 * ```ts
 * extractedTypeNames(spec.groups, Object.keys(spec.schemas)).nameOf("items", "listItems", "Response");
 * // "ListItemsResponse"
 * ```
 */
export function extractedTypeNames(
  groups: readonly ParsedGroup[],
  declared: Iterable<string>,
): ExtractedTypeNames {
  const wanted = wantedTypes(groups);
  const count = new Map<string, number>();
  for (const { base } of wanted) count.set(base, (count.get(base) ?? 0) + 1);

  const taken = new Set(declared);
  const names = new Map<string, string>();
  for (const { key, base } of wanted) {
    if (count.get(base) !== 1 || taken.has(base)) continue;
    names.set(key, base);
    taken.add(base);
  }
  for (const { key, group, base } of wanted) {
    if (names.has(key)) continue;
    const name = free(`${qualifier(group)}${base}`, taken);
    names.set(key, name);
    taken.add(name);
  }

  return {
    nameOf: (group, endpoint, kind) =>
      names.get(keyOf(group, endpoint, kind)) ?? `${typeName(endpoint)}${kind}`,
  };
}

/** Every type the import's endpoints extract, with the name it would like. */
function wantedTypes(
  groups: readonly ParsedGroup[],
): { key: string; group: string; base: string }[] {
  return groups.flatMap((group) =>
    group.endpoints.flatMap((ep) =>
      (["Response", "Params", "Body"] as const)
        .filter((kind) => EXTRACTORS[kind](ep) !== null)
        .map((kind) => ({
          key: keyOf(group.name, ep.name, kind),
          group: group.name,
          base: `${typeName(ep.name)}${kind}`,
        })),
    ),
  );
}

function keyOf(group: string, endpoint: string, kind: ExtractedKind): string {
  return `${group}\u0000${endpoint}\u0000${kind}`;
}

/** The name itself, or the first numbered form of it nothing has taken. */
function free(name: string, taken: ReadonlySet<string>): string {
  let candidate = name;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${name}${n}`;
  return candidate;
}

/* The name capitalised, as a type is named after it; where that reads as no
   identifier — `3d`, `2fa-verify` — the identifier made of it. A name that
   reads as one keeps the type names it has always had. */
function typeName(name: string): string {
  const capitalised = name.charAt(0).toUpperCase() + name.slice(1);
  return IDENTIFIER.test(capitalised) ? capitalised : toSafeIdentifier(name);
}

/* What a type is qualified by: its group, or `Api` for the API's own endpoints, which have none. */
function qualifier(group: string): string {
  return isTopLevel(group) ? "Api" : typeName(group);
}

import type { ParsedSpec } from "../apis";
import type { ManageRequest } from "./manage-plan";
import { isParsedSpec } from "./parsed-spec-guard";
import type { JsonResponse } from "./route-types";
import { isObject, isString } from "./validate-body";

/**
 * Read the body of an inventory request: the import, and the spec to
 * compare its files with, when one is sent. Answers 400 otherwise.
 *
 * @param body - The request body, as parsed
 * @param res - The route's response, answered when the body is refused
 * @returns The request, or `null` once the route is answered
 */
export function validateInventoryBody(
  body: unknown,
  res: JsonResponse,
): { name: string; newSpec?: ParsedSpec } | null {
  if (!isObject(body) || !isString(body.name)) {
    res.status(400).json({ error: "Expected { name, newSpec? }" });
    return null;
  }
  if (body.newSpec !== undefined && !isParsedSpec(body.newSpec)) {
    res.status(400).json({ error: "newSpec is not a spec as Studio parsed it" });
    return null;
  }
  return { name: body.name, ...(body.newSpec !== undefined && { newSpec: body.newSpec }) };
}

/**
 * Read the body of a manage preview or apply: the import, its spec, the
 * endpoints to add and remove by group, and whether every file is written
 * again from the spec. Answers 400 otherwise.
 *
 * @param body - The request body, as parsed
 * @param res - The route's response, answered when the body is refused
 * @returns The request, or `null` once the route is answered
 */
export function validateManageBody(body: unknown, res: JsonResponse): ManageRequest | null {
  if (!isObject(body) || !isString(body.name) || !isParsedSpec(body.spec)) {
    res.status(400).json({
      error: "Expected { name, spec, toAdd?, toRemove? } with the spec as Studio parsed it",
    });
    return null;
  }
  const toAdd = readGroups(body.toAdd);
  const toRemove = readGroups(body.toRemove);
  if (toAdd === null || toRemove === null) {
    res.status(400).json({ error: "toAdd and toRemove list endpoint names by group" });
    return null;
  }
  if (body.regenerate !== undefined && typeof body.regenerate !== "boolean") {
    res.status(400).json({ error: "regenerate is true or false" });
    return null;
  }
  const regenerate = body.regenerate === true;
  return { name: body.name, spec: body.spec, toAdd, toRemove, ...(regenerate && { regenerate }) };
}

function readGroups(value: unknown): Record<string, string[]> | null {
  if (value === undefined) return {};
  if (!isObject(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every((entry): entry is [string, string[]] => isNames(entry[1]))) return null;
  /* fromEntries defines each key as its own, so a group named "__proto__" stays a group. */
  return Object.fromEntries(entries);
}

function isNames(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((name) => typeof name === "string");
}

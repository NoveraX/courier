import type { GenerateOptions } from "../apis";
import { isRecord } from "./mocks-edit/is-record";

const TYPES = ["openapi", "swagger", "postman"] as const;
const VALIDATIONS = ["zod", "valibot", "arktype", "none"] as const;
const GROUPINGS = ["tag", "path", "single"] as const;
const CLIENTS = ["direct", "proxy", "both", "none"] as const;
const FLAGS = ["generateTypes", "generateSchemas", "addAuthMiddleware", "includeComments"] as const;

/**
 * Read generation options from a request body: the output directory, and
 * each choice the import wizard makes, only when it is one the generator
 * knows. Options a config may hold but a request cannot — `include`,
 * `exclude`, `transform` — are not read.
 *
 * @param value - The options from a request body
 * @returns The options, or `null` when they are not generation options
 * @example
 * ```ts
 * const options = readGenerateOptions(body.options);
 * ```
 */
export function readGenerateOptions(value: unknown): GenerateOptions | null {
  if (!isRecord(value) || typeof value.outputDir !== "string") return null;
  const type = oneOf(value.type ?? "openapi", TYPES);
  const validation = optional(value.validation, VALIDATIONS);
  const groupBy = optional(value.groupBy, GROUPINGS);
  const generateClient = optional(value.generateClient, CLIENTS);
  const selectedEndpoints = readSelection(value.selectedEndpoints);
  if (type === undefined || validation === false || groupBy === false || generateClient === false)
    return null;
  if (selectedEndpoints === false) return null;
  if (value.sourceName !== undefined && typeof value.sourceName !== "string") return null;
  const options: GenerateOptions = {
    type,
    outputDir: value.outputDir,
    selectedEndpoints,
    ...(value.sourceName !== undefined && { sourceName: value.sourceName }),
    ...(validation !== undefined && { validation }),
    ...(groupBy !== undefined && { groupBy }),
    ...(generateClient !== undefined && { generateClient }),
  };
  for (const flag of FLAGS) {
    const flagValue = value[flag];
    if (flagValue === undefined) continue;
    if (typeof flagValue !== "boolean") return null;
    options[flag] = flagValue;
  }
  return options;
}

function oneOf<const TAllowed extends readonly string[]>(
  value: unknown,
  allowed: TAllowed,
): TAllowed[number] | undefined {
  return allowed.find((item) => item === value);
}

/* Absent is `undefined`; present but unknown is `false`. */
function optional<const TAllowed extends readonly string[]>(
  value: unknown,
  allowed: TAllowed,
): TAllowed[number] | undefined | false {
  if (value === undefined) return undefined;
  return oneOf(value, allowed) ?? false;
}

function readSelection(value: unknown): Record<string, string[]> | null | false {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  if (!entries.every((entry): entry is [string, string[]] => isStrings(entry[1]))) return false;
  /* fromEntries defines each key as its own, so a group named "__proto__" stays a group. */
  return Object.fromEntries(entries);
}

function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

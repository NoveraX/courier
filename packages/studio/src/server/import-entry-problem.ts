import { isRecord } from "@noverax/courier-cli/devkit";

const IMPORT_TYPES: ReadonlySet<unknown> = new Set(["url", "file", "raw"]);
const SPEC_TYPES: ReadonlySet<unknown> = new Set([
  "openapi",
  "swagger",
  "graphql",
  "asyncapi",
  "postman",
]);
const CHOICES: ReadonlyArray<[string, ReadonlySet<unknown>]> = [
  ["validation", new Set(["zod", "valibot", "arktype", "none"])],
  ["groupBy", new Set(["tag", "path", "single"])],
  ["generateClient", new Set(["direct", "proxy", "both", "none"])],
];
const FLAGS = ["generateTypes", "generateSchemas", "addAuthMiddleware", "includeComments"];
const SELECTOR_LISTS = ["tags", "paths", "operationIds"];

function kindOf(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (Array.isArray(value)) return "a list";
  return typeof value === "object" ? "an object" : `a ${typeof value}`;
}

function isStrings(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isWebUrl(value: unknown): boolean {
  if (typeof value !== "string" || !URL.canParse(value)) return false;
  const { protocol } = new URL(value);
  return protocol === "http:" || protocol === "https:";
}

/* What is wrong with an optional field, or `null`. */
function optionalProblem(
  entry: Record<string, unknown>,
  key: string,
  ok: (value: unknown) => boolean,
  want: string,
): string | null {
  const value = entry[key];
  return value === undefined || ok(value) ? null : `${key} is ${kindOf(value)}, not ${want}`;
}

function selectorProblem(entry: Record<string, unknown>, key: string): string | null {
  const selector = entry[key];
  if (selector === undefined) return null;
  if (!isRecord(selector) || Array.isArray(selector))
    return `${key} is ${kindOf(selector)}, not an object of tags, paths and operationIds`;
  const list = SELECTOR_LISTS.find(
    (name) => selector[name] !== undefined && !isStrings(selector[name]),
  );
  return list === undefined ? null : `${key}.${list} is not a list of strings`;
}

function isAuth(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.type === "bearer") return typeof value.token === "string";
  if (value.type === "basic")
    return typeof value.username === "string" && typeof value.password === "string";
  if (value.type !== "header" || !isRecord(value.headers)) return false;
  return Object.values(value.headers).every((header) => typeof header === "string");
}

/* The fields only a URL import carries: where to fetch, how, and what to accept. */
function urlProblem(entry: Record<string, unknown>): string | null {
  if (!isWebUrl(entry.from)) return `from is ${kindOf(entry.from)}, not an http or https URL`;
  return (
    optionalProblem(entry, "auth", isAuth, "a bearer, basic or header auth") ??
    optionalProblem(entry, "pinHash", (v) => typeof v === "string", "a spec hash")
  );
}

/**
 * Tell what is wrong with one entry of a config's `imports`, or `null` when
 * it is an import Studio can act on: the kinds of its fields, as
 * `CourierImportEntry` declares them. A config is plain code, so an entry
 * that names a URL by a number reached every route that trusted the type.
 *
 * Where the files go is checked by the routes that write them.
 *
 * @param entry - The entry as the config holds it
 * @returns What is wrong, starting with the field it is about, or `null`
 * @example
 * ```ts
 * importEntryProblem({ importType: "url", type: "openapi", from: 5, outputDir: "src/api" });
 * // → "from is a number, not an http or https URL"
 * ```
 */
export function importEntryProblem(entry: unknown): string | null {
  if (!isRecord(entry) || Array.isArray(entry)) return `is ${kindOf(entry)}, not an import`;
  if (!IMPORT_TYPES.has(entry.importType)) return "importType is not url, file or raw";
  if (!SPEC_TYPES.has(entry.type))
    return "type is not openapi, swagger, graphql, asyncapi or postman";
  if (typeof entry.outputDir !== "string")
    return `outputDir is ${kindOf(entry.outputDir)}, not a folder`;
  const problems = [
    optionalProblem(entry, "sourceName", (v) => typeof v === "string", "a name"),
    ...CHOICES.map(([key, allowed]) =>
      optionalProblem(entry, key, (v) => allowed.has(v), [...allowed].join(", ")),
    ),
    ...FLAGS.map((key) =>
      optionalProblem(entry, key, (v) => typeof v === "boolean", "true or false"),
    ),
    selectorProblem(entry, "include"),
    selectorProblem(entry, "exclude"),
    optionalProblem(entry, "transform", (v) => typeof v === "function", "a function"),
    entry.importType === "url" ? urlProblem(entry) : null,
  ];
  return problems.find((problem) => problem !== null) ?? null;
}

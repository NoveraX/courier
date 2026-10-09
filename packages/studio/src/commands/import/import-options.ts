import type {
  CourierImportGenerateClient,
  CourierImportGroupBy,
  CourierImportSelector,
  CourierImportSpecType,
  CourierImportValidation,
} from "@noverax/courier/config";

import type { GenerateOptions } from "../../apis";

/** The options of `import` that shape the generated code, as typed on the command line. */
export interface ImportFlags {
  out?: string | undefined;
  validation?: string | undefined;
  "group-by"?: string | undefined;
  client?: string | undefined;
  types?: boolean | undefined;
  schemas?: boolean | undefined;
  comments?: boolean | undefined;
  "auth-middleware"?: boolean | undefined;
  include?: string | undefined;
  exclude?: string | undefined;
}

const VALIDATIONS = ["zod", "valibot", "arktype", "none"] as const;
const GROUPINGS = ["tag", "path", "single"] as const;
const CLIENTS = ["direct", "proxy", "both", "none"] as const;
const SELECTOR_KINDS: ReadonlyMap<string, keyof CourierImportSelector> = new Map([
  ["tag", "tags"],
  ["path", "paths"],
  ["op", "operationIds"],
]);

function oneOf<TValue extends string>(
  flag: string,
  allowed: readonly TValue[],
  given: string | undefined,
  fallback: TValue,
): TValue {
  if (given === undefined) return fallback;
  const found = allowed.find((value) => value === given);
  if (found !== undefined) return found;
  throw new Error(`--${flag} takes ${allowed.join(", ")}, not "${given}"`);
}

/**
 * The endpoints a `--include` or `--exclude` names: `tag:<name>`,
 * `path:<path>` and `op:<operationId>`, separated by commas.
 *
 * @param flag - The option's name, for the error
 * @param given - What was typed
 * @returns The selector, or `undefined` when nothing was typed
 * @throws {Error} When a part names none of them
 * @example
 * ```ts
 * selectorOf("include", "tag:pets,op:getUser"); // { tags: ["pets"], operationIds: ["getUser"] }
 * ```
 */
export function selectorOf(
  flag: string,
  given: string | undefined,
): CourierImportSelector | undefined {
  if (given === undefined || given.trim() === "") return undefined;
  const selector: CourierImportSelector = {};
  for (const part of given
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)) {
    const at = part.indexOf(":");
    const kind = at < 1 ? undefined : SELECTOR_KINDS.get(part.slice(0, at));
    const value = part.slice(at + 1);
    if (kind === undefined || value === "") {
      throw new Error(
        `--${flag} takes tag:<name>, path:<path> and op:<operationId>, not "${part}"`,
      );
    }
    selector[kind] = [...(selector[kind] ?? []), value];
  }
  return selector;
}

/**
 * The generation options the command line asks for, with Import API's
 * defaults for each one it leaves out: `src/api`, Zod, grouped by tag,
 * types, schemas and comments, and the direct client.
 *
 * @param flags - The options as typed
 * @param sourceName - The import's name
 * @param type - The specification's type
 * @returns The options, as the import wizard sends them
 * @throws {Error} When an option holds a value it does not take
 * @example
 * ```ts
 * importOptions({ validation: "valibot", "group-by": "path" }, "petStore", "openapi");
 * ```
 */
export function importOptions(
  flags: ImportFlags,
  sourceName: string,
  type: CourierImportSpecType,
): GenerateOptions {
  const include = selectorOf("include", flags.include);
  const exclude = selectorOf("exclude", flags.exclude);
  return {
    type,
    sourceName,
    outputDir: flags.out ?? "src/api",
    validation: oneOf<CourierImportValidation>("validation", VALIDATIONS, flags.validation, "zod"),
    groupBy: oneOf<CourierImportGroupBy>("group-by", GROUPINGS, flags["group-by"], "tag"),
    generateClient: oneOf<CourierImportGenerateClient>("client", CLIENTS, flags.client, "direct"),
    generateTypes: flags.types ?? true,
    generateSchemas: flags.schemas ?? true,
    includeComments: flags.comments ?? true,
    addAuthMiddleware: flags["auth-middleware"] ?? false,
    selectedEndpoints: null,
    ...(include && { include }),
    ...(exclude && { exclude }),
  };
}

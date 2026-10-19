/**
 * The auth middleware an import's source is generated with.
 *
 * The secret was read into a static header when the source module loaded.
 * Studio loads the config, which imports every source, so an import
 * generated with auth made the whole config fail to load wherever the
 * variable was not set — and turned Import API and the mock servers off
 * with it. A middleware reads it on each request instead.
 */

import type { ParsedSecurityScheme } from "../parser/types";
import { jsLiteral } from "./literals";

/**
 * The reader every generated middleware goes through. Interpolating
 * `process.env.X` sent `Bearer undefined` when the variable was unset, and
 * Vite replaces `process.env` with `{}`, so the value was always missing.
 */
const REQUIRE_ENV = [
  "/**",
  " * Read a variable this client cannot work without.",
  " *",
  " * It is read on every request rather than when this module loads, so a",
  " * module importing the source loads without it, and a call made without",
  " * it fails saying what is missing.",
  " */",
  "function requireEnv(name: string): string {",
  "  /* Reached through globalThis so this file needs no Node type",
  "     definitions to compile in a project that has none, and typed",
  "     with no global type a schema of the file could stand for. */",
  "  const runtime = globalThis as { process?: { env?: { [name: string]: string | undefined } } };",
  "  const value = runtime.process?.env?.[name];",
  "  if (!value) {",
  "    throw new Error(",
  '      name + " is not set. This client sends it on every request. Set it in the environment" +',
  '        " the calls are made from; it reads the environment, so it belongs on a server" +',
  '        " rather than in a browser bundle.",',
  "    );",
  "  }",
  "  return value;",
  "}",
  "",
];

/** What a source needs for its auth. */
export interface SourceAuth {
  /** The middleware, as the `middleware` option's list writes it. */
  middleware: string;
  /** The reader of the variable, declared after the source. */
  helper: string[];
}

/**
 * The middleware sending the first security scheme the specification
 * declares, reading its secret from the environment on every request.
 *
 * @param schemes - The specification's security schemes
 * @param sourceName - The source's binding, which names the variable
 * @returns The middleware and its reader, or `null` for no scheme it can send
 * @example
 * ```ts
 * sourceAuth([{ name: "b", type: "bearer" }], "petStore")?.middleware;
 * // 'authMiddleware({ getToken: () => requireEnv("PETSTORE_TOKEN") })'
 * ```
 */
export function sourceAuth(
  schemes: readonly ParsedSecurityScheme[],
  sourceName: string,
): SourceAuth | null {
  const [scheme] = schemes;
  if (!scheme) return null;
  const prefix = sourceName.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
  const options = middlewareOptions(scheme, prefix);
  return options ? { middleware: `authMiddleware({ ${options} })`, helper: REQUIRE_ENV } : null;
}

/*
 * How the variable each kind of scheme reads its secret from ends, after
 * the source's name. Looked up in a map, a type no scheme has — one a
 * specification sent to Studio may hold — finds no suffix rather than
 * being turned into a key.
 */
const VARIABLE_SUFFIX: ReadonlyMap<unknown, string> = new Map(
  Object.entries({
    bearer: "TOKEN",
    basic: "CREDENTIALS",
    oauth2: "ACCESS_TOKEN",
    apiKey: "API_KEY",
  } satisfies Record<Exclude<ParsedSecurityScheme["type"], "unknown">, string>),
);

function middlewareOptions(scheme: ParsedSecurityScheme, prefix: string): string | null {
  const suffix = VARIABLE_SUFFIX.get(scheme.type);
  if (suffix === undefined) return null;
  const token = `getToken: () => requireEnv("${prefix}_${suffix}")`;
  switch (scheme.type) {
    case "bearer":
    case "oauth2":
      return token;
    case "basic":
      return `scheme: "Basic", ${token}`;
    case "apiKey":
      if (scheme.in !== "header" || !scheme.paramName) return null;
      return `header: ${jsLiteral(scheme.paramName)}, scheme: "", ${token}`;
    default:
      return null;
  }
}

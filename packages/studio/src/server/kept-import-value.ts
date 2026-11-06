/**
 * The API import left unfinished, as Studio keeps it: in the project's
 * database, and sent to every page of the project as it connects — a page
 * without the project's token too.
 */

import { isSecretVariableName, urlWithoutSecrets } from "@noverax/courier/internal";

import { isPlainObject } from "./is-plain-object";

const NAMED = ["token", "username", "password"] as const;

/**
 * What of the import left unfinished Studio keeps and sends: nothing of an
 * address that carries a credential, and no name of the auth's that is not
 * written as a variable's — a value typed in its place. The import wizard
 * keeps neither itself; Studio holds a page of an older build, or of
 * another, to the same, and an import an older Studio kept.
 *
 * @param value - The import, as a page sent it or the database kept it
 * @returns What to keep and send: `{}` for an address with a credential
 * @example
 * ```ts
 * keptImportValue({ source: "url", content: " https://ana:pw@api.test/openapi.json" }); // → {}
 * ```
 */
export function keptImportValue(value: unknown): unknown {
  if (!isPlainObject(value) || value.source !== "url") return value;
  const { content, auth } = value;
  if (typeof content !== "string" || urlWithoutSecrets(content) !== content) return {};
  return isPlainObject(auth) ? { ...value, auth: namesOnly(auth) } : value;
}

function namesOnly(auth: Record<string, unknown>): Record<string, unknown> {
  const kept: Record<string, unknown> = { ...auth };
  for (const field of NAMED) kept[field] = nameOf(auth[field]);
  if (Array.isArray(auth.headers)) {
    const rows: readonly unknown[] = auth.headers;
    kept.headers = rows.map((row) =>
      isPlainObject(row) ? { ...row, variable: nameOf(row.variable) } : row,
    );
  }
  return kept;
}

function nameOf(name: unknown): string {
  return typeof name === "string" && isSecretVariableName(name.trim()) ? name.trim() : "";
}

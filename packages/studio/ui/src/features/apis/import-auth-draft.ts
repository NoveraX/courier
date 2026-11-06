/**
 * The auth the import wizard reads a specification behind with, as the
 * user fills it in: each credential is the name of the environment
 * variable that holds it, never its value.
 */

import { isSecretVariableName } from "@noverax/courier/internal";

/** How the wizard authenticates to a specification's host. */
export type AuthKind = "none" | "bearer" | "basic" | "header";

/** A header the auth sends, and the variable that holds its value. */
export interface HeaderVariable {
  name: string;
  variable: string;
}

/** The auth as the user fills it in; the fields of other kinds are kept while they switch. */
export interface AuthDraft {
  kind: AuthKind;
  token: string;
  username: string;
  password: string;
  headers: HeaderVariable[];
}

/** An environment variable, by its name. */
export interface VariableRef {
  env: string;
}

/** An import's auth as Studio is sent it: each credential named by the variable that holds it. */
export type ImportAuthRefs =
  | { type: "bearer"; token: VariableRef }
  | { type: "basic"; username: VariableRef; password: VariableRef }
  | { type: "header"; headers: Record<string, VariableRef> };

/** The most headers an import's auth sends, as Studio takes them. */
export const MAX_AUTH_HEADERS = 32;

const NOT_A_NAME =
  "A variable's name is written in capitals, digits and _, not starting with a digit: ORDERS_SPEC_TOKEN";

/** No auth: the wizard reads the specification as anyone could. */
export const NO_AUTH: AuthDraft = {
  kind: "none",
  token: "",
  username: "",
  password: "",
  headers: [{ name: "", variable: "" }],
};

function ref(name: string): VariableRef {
  return { env: name.trim() };
}

/* The rows the user filled in, both halves of each. */
function filledHeaders(draft: AuthDraft): HeaderVariable[] {
  return draft.headers.filter((row) => row.name.trim() !== "" || row.variable.trim() !== "");
}

/**
 * What the draft still lacks before Studio can read with it: a variable
 * or a header's name left empty, or a variable's name not written as one —
 * a value typed in its place, which is never sent. Studio itself says
 * what is wrong with a header's name.
 *
 * @param draft - The auth as filled in
 * @returns What to fill in, or `null` when nothing is left
 * @example
 * ```ts
 * authLacks({ ...NO_AUTH, kind: "bearer" }); // → "Name the variable that holds the token"
 * ```
 */
export function authLacks(draft: AuthDraft): string | null {
  const empty = emptyOf(draft);
  if (empty !== null) return empty;
  return variablesOf(draft).every(isSecretVariableName) ? null : NOT_A_NAME;
}

function emptyOf(draft: AuthDraft): string | null {
  if (draft.kind === "bearer" && draft.token.trim() === "")
    return "Name the variable that holds the token";
  if (draft.kind === "basic" && (draft.username.trim() === "" || draft.password.trim() === ""))
    return "Name the variables that hold the user and the password";
  if (draft.kind !== "header") return null;
  const rows = filledHeaders(draft);
  if (rows.length === 0) return "Name a header and the variable that holds its value";
  return rows.every((row) => row.name.trim() !== "" && row.variable.trim() !== "")
    ? null
    : "Name each header and the variable that holds its value";
}

/**
 * The auth Studio is sent for a draft the user finished, every credential
 * named by its variable.
 *
 * @param draft - The auth as filled in
 * @returns The auth, or `undefined` for none or one not finished
 * @example
 * ```ts
 * authRefsOf({ ...NO_AUTH, kind: "bearer", token: "ORDERS_SPEC_TOKEN" }); // → { type: "bearer", token: { env: "ORDERS_SPEC_TOKEN" } }
 * ```
 */
export function authRefsOf(draft: AuthDraft): ImportAuthRefs | undefined {
  if (draft.kind === "none" || authLacks(draft) !== null) return undefined;
  if (draft.kind === "bearer") return { type: "bearer", token: ref(draft.token) };
  if (draft.kind === "basic")
    return { type: "basic", username: ref(draft.username), password: ref(draft.password) };
  const headers: Record<string, VariableRef> = {};
  for (const row of filledHeaders(draft)) {
    Object.defineProperty(headers, row.name.trim(), {
      value: ref(row.variable),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return { type: "header", headers };
}

/**
 * The variables the draft names, each once, for Studio to say which its
 * environment sets.
 *
 * @param draft - The auth as filled in
 * @returns The names, trimmed; none for no auth
 * @example
 * ```ts
 * variablesOf({ ...NO_AUTH, kind: "basic", username: "SPEC_USER", password: "SPEC_PASSWORD" }); // → ["SPEC_USER", "SPEC_PASSWORD"]
 * ```
 */
export function variablesOf(draft: AuthDraft): string[] {
  const names =
    draft.kind === "bearer"
      ? [draft.token]
      : draft.kind === "basic"
        ? [draft.username, draft.password]
        : draft.kind === "header"
          ? draft.headers.map((row) => row.variable)
          : [];
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))];
}

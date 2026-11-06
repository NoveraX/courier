import { isSecretVariableName } from "@noverax/courier/internal";
import * as vscode from "vscode";

/** How an address is read: as anyone reads it, or with credentials the environment holds. */
export type Credentials =
  | { kind: "none" }
  | { kind: "bearer"; token: string }
  | { kind: "basic"; username: string; password: string }
  | { kind: "header"; headers: string };

/* RFC 9110's token: what a header's name is made of. */
const HEADER = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

const KINDS = [
  { label: "No Credentials", description: "anyone can read the document", by: "none" },
  { label: "Bearer Token", description: "Authorization: Bearer", by: "bearer" },
  { label: "User and Password", description: "Authorization: Basic", by: "basic" },
  { label: "Headers", description: "an API key's header, say", by: "header" },
] as const;

const WHERE =
  "The environment variable that holds it, set where the command runs or in a .env file of the project: its name, never the value";

/**
 * Why a name is no environment variable's, as the import's credentials are
 * named: in capitals, digits and `_`, not starting with a digit.
 *
 * @param value - The name, as typed
 * @returns The problem, or `undefined` for a name
 * @example
 * ```ts
 * variableProblem("ORDERS_SPEC_TOKEN"); // → undefined
 * ```
 */
export function variableProblem(value: string): string | undefined {
  if (value.trim() === "") return "Name the variable";
  /* The core's rule, as Studio's: a value pasted in a name's place, which mixes in lower case, goes no further. */
  return isSecretVariableName(value.trim())
    ? undefined
    : "A variable's name is written in capitals, digits and _, not starting with a digit: ORDERS_SPEC_TOKEN";
}

/**
 * Why a list of headers names no header with its variable, as
 * `X-Api-Key=ORDERS_API_KEY,X-Tenant=TENANT_ID` does.
 *
 * @param value - The list, as typed
 * @returns The problem, or `undefined` for a list
 * @example
 * ```ts
 * headersProblem("X-Api-Key=ORDERS_API_KEY"); // → undefined
 * ```
 */
export function headersProblem(value: string): string | undefined {
  const pairs = value
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean);
  if (pairs.length === 0) return "Name a header and its variable: X-Api-Key=ORDERS_API_KEY";
  for (const pair of pairs) {
    const at = pair.indexOf("=");
    const header = pair.slice(0, Math.max(at, 0)).trim();
    if (at < 1 || !HEADER.test(header)) return `${pair} names no header: Header=VARIABLE`;
    const problem = variableProblem(pair.slice(at + 1));
    if (problem) return `${header}: ${problem}`;
  }
  return undefined;
}

/**
 * The options of `courier-studio import` that name the credentials an
 * address is read with: the variables that hold them, never a value, so
 * none goes into the terminal or its history.
 *
 * @param credentials - What the address is read with
 * @returns The options; none for no credentials
 * @example
 * ```ts
 * credentialArgs({ kind: "bearer", token: "ORDERS_SPEC_TOKEN" }); // → ["--bearer-env", "ORDERS_SPEC_TOKEN"]
 * ```
 */
export function credentialArgs(credentials: Credentials): string[] {
  if (credentials.kind === "bearer") return ["--bearer-env", credentials.token.trim()];
  if (credentials.kind === "basic") {
    return ["--basic-env", `${credentials.username.trim()}:${credentials.password.trim()}`];
  }
  if (credentials.kind === "none") return [];
  const pairs = credentials.headers
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const at = pair.indexOf("=");
      return `${pair.slice(0, at).trim()}=${pair.slice(at + 1).trim()}`;
    });
  return ["--header-env", pairs.join(",")];
}

function ask(title: string, placeHolder: string, validateInput: typeof variableProblem) {
  return vscode.window.showInputBox({ title, placeHolder, prompt: WHERE, validateInput });
}

/**
 * Ask how an address is read: with no credentials, or with those the
 * environment variables the user names hold.
 *
 * @returns The options to read it with, or `undefined` when the user gave up
 * @example
 * ```ts
 * const credentials = await askCredentials();
 * if (credentials) runStudioCommand(project, "Import API", ["import", url, ...credentials]);
 * ```
 */
export async function askCredentials(): Promise<string[] | undefined> {
  const picked = await vscode.window.showQuickPick([...KINDS], {
    title: "Import an API: the address's credentials",
  });
  if (!picked) return undefined;
  if (picked.by === "none") return [];
  if (picked.by === "bearer") {
    const token = await ask(
      "The variable that holds the token",
      "ORDERS_SPEC_TOKEN",
      variableProblem,
    );
    return token === undefined ? undefined : credentialArgs({ kind: "bearer", token });
  }
  if (picked.by === "basic") {
    const username = await ask("The variable that holds the user", "SPEC_USER", variableProblem);
    if (username === undefined) return undefined;
    const password = await ask(
      "The variable that holds the password",
      "SPEC_PASSWORD",
      variableProblem,
    );
    return password === undefined
      ? undefined
      : credentialArgs({ kind: "basic", username, password });
  }
  const headers = await ask(
    "Each header, and the variable that holds its value",
    "X-Api-Key=ORDERS_API_KEY,X-Tenant=TENANT_ID",
    headersProblem,
  );
  return headers === undefined ? undefined : credentialArgs({ kind: "header", headers });
}

/**
 * The address an OpenAPI specification says its API lives at.
 */

import { fieldOf, listAt, nodeAt, textAt } from "./spec-node";

const VARIABLE = /\{([^{}]+)\}/g;

/**
 * The first server's URL, with each of its variables filled in.
 *
 * Atlassian and Azure write the host, the port or a version as a variable —
 * `https://{region}.api.example.com/{version}` — and give each a default.
 * Taking the URL as written made every call fail before it left the client.
 * A variable is filled with its default, or with the first value it allows
 * when it names none; one that says neither is left as written.
 *
 * @param servers - The specification's `servers`
 * @returns The URL, or `/` when no server is declared
 * @example
 * ```ts
 * serverUrl([{ url: "https://{env}.example.com", variables: { env: { default: "api" } } }]);
 * // → "https://api.example.com"
 * ```
 */
export function serverUrl(servers: unknown): string {
  const first: unknown = Array.isArray(servers) ? servers[0] : undefined;
  const url = textAt(first, "url");
  if (url === undefined) return "/";
  const variables = nodeAt(first, "variables") ?? {};

  return url.replace(VARIABLE, (placeholder: string, name: string) => {
    const value = filledValue(fieldOf(variables, name));
    return value === undefined ? placeholder : value;
  });
}

function filledValue(variable: unknown): string | undefined {
  const value = fieldOf(variable, "default") ?? listAt(variable, "enum")[0];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

/**
 * The address an OpenAPI specification says its API lives at.
 */

import type { SpecNode } from "./types";

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
  const first: SpecNode | undefined = Array.isArray(servers) ? servers[0] : undefined;
  if (typeof first?.url !== "string") return "/";
  const variables: SpecNode = first.variables ?? {};

  return first.url.replace(VARIABLE, (placeholder: string, name: string) => {
    const value = filledValue(variables[name]);
    return value === undefined ? placeholder : value;
  });
}

function filledValue(variable: SpecNode | undefined): string | undefined {
  const value = variable?.default ?? (Array.isArray(variable?.enum) ? variable.enum[0] : undefined);
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

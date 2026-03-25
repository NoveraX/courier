/**
 * Splits an endpoint definition into head (config) and body (callback).
 *
 * Given: `    getAll: endpoint<User[]>({ response: ... })((http) => http.get("")),`
 * Head:  `    getAll: endpoint<User[]>({ response: ... })`
 * Body:  `((http) => http.get("")),`
 */

export interface EndpointParts {
  /** Everything up to and including the config call: `name: endpoint<R, V>({ config })` */
  head: string;
  /** The callback call with trailing comma: `((http, vars) => ...),` */
  body: string;
}

/**
 * Split an endpoint code block into head (config) and body (callback).
 *
 * Uses bracket-depth tracking to find where the first call `(config)` ends.
 * Returns null if the code doesn't match expected endpoint structure.
 */
export function splitEndpoint(code: string): EndpointParts | null {
  const epIdx = code.indexOf("endpoint");
  if (epIdx === -1) return null;

  let i = epIdx;
  /* Skip past `endpoint` keyword and generic params `<...>` */
  while (i < code.length && code[i] !== "(") i++;
  if (i >= code.length) return null;

  /* Track first balanced paren group (the config call) */
  const splitIdx = findBalancedClose(code, i);
  if (splitIdx === -1) return null;

  return {
    head: code.slice(0, splitIdx + 1),
    body: code.slice(splitIdx + 1),
  };
}

/** Find the index of the closing bracket that balances the opening at `start` */
function findBalancedClose(code: string, start: number): number {
  let depth = 0;

  for (let i = start; i < code.length; i++) {
    const ch = code[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    if (ch === ")" || ch === "}" || ch === "]") depth--;
    if (depth === 0) return i;
  }

  return -1;
}

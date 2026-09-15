/**
 * Splits an endpoint definition into the part the generator owns and the part
 * a person may edit.
 *
 * Given: `    getAll: query.response(UserSchema).via((http) => http.get("")),`
 * Head:  `    getAll: query.response(UserSchema).via(`
 * Body:  `(http) => http.get("")),`
 */

const TERMINAL = /\.\s*(?:via|implement)\s*\(/;

export interface EndpointParts {
  /** The declaration up to and including the terminal's opening bracket. */
  head: string;
  /** The closure and everything after it, including the trailing comma. */
  body: string;
}

/**
 * Split an endpoint code block into its declaration and its closure.
 *
 * The declaration is regenerated from the specification; the closure is
 * preserved so hand edits survive regeneration.
 *
 * @param code - one endpoint's source, including its property name
 * @returns the two parts, or null when the code is not an endpoint definition
 */
export function splitEndpoint(code: string): EndpointParts | null {
  const match = TERMINAL.exec(code);
  if (!match) return null;

  const splitIdx = match.index + match[0].length;
  return {
    head: code.slice(0, splitIdx),
    body: code.slice(splitIdx),
  };
}

import { ConfigurationError } from "../errors";

/**
 * Refuse variables that would not reach the proxy intact.
 *
 * A proxy call's variables travel as JSON, which turns a Uint8Array into an
 * object of numbered keys and an ArrayBuffer, a Blob or a stream into `{}`. An endpoint
 * that sent such a variable as its body sent "[object Object]" upstream,
 * where the same call in direct mode sent the bytes. Binary data belongs in a
 * FormData, which the proxy carries as multipart.
 *
 * @param variables - The call's variables, when they are not a FormData
 * @throws ConfigurationError naming the first binary value found
 *
 * @example
 * ```ts
 * assertJsonVariables({ id: 1 });                      // passes
 * assertJsonVariables({ body: new Uint8Array([1]) });  // throws: variables.body
 * ```
 */
export function assertJsonVariables(variables: unknown): void {
  const path = findBinary(variables, "variables", new Set());
  if (path === undefined) return;
  throw new ConfigurationError(
    "PROXY_VARIABLE_NOT_SERIALIZABLE",
    `[courier] ${path} is binary data, which a proxy call cannot carry as JSON. Send it in a FormData instead.`,
  );
}

function findBinary(value: unknown, path: string, seen: Set<object>): string | undefined {
  if (isBinary(value)) return path;
  if (typeof value !== "object" || value === null || seen.has(value)) return undefined;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    const at = Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`;
    const found = findBinary(child, at, seen);
    if (found !== undefined) return found;
  }
  return undefined;
}

function isBinary(value: unknown): boolean {
  return (
    value instanceof Blob ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    (typeof ReadableStream !== "undefined" && value instanceof ReadableStream)
  );
}

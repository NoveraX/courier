/**
 * An answer's init as the platform reads it: its status, its status text and
 * its headers, each its own. The platform reads a key an init does not have
 * of the init's prototype — and the headers of the prototype of the
 * dictionary it makes of the init — so an answer the core builds names all
 * three, and `Object.prototype`, given any of them in the process, gives the
 * answer nothing.
 *
 * @param status - The answer's status
 * @param headers - Its headers; none, where it is given none
 * @returns The init
 * @example
 * ```ts
 * return new Response(null, answerInit(204, headers));
 * ```
 */
export function answerInit(status: number, headers: HeadersInit = {}): ResponseInit {
  return { status, statusText: "", headers };
}

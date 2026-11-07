import type { IncomingMessage } from "node:http"

/* The path whose calls keep the bytes their body came as: the encoding example's echo. */
const KEPT_UNDER = "/echo"

/* Each body the echo was sent, as it came, for as long as its request lives. */
const bodies = new WeakMap<IncomingMessage, Buffer>()

/**
 * Keep the bytes a call to the echo was sent, as the body parsers read
 * them — no more than the parsers take — so the echo can answer with
 * what came over the wire beside what the parser made of it. Other calls
 * keep nothing.
 *
 * @param request - The call
 * @param _response - Its answer, which the parsers name too
 * @param body - The bytes the parser read
 * @example
 * ```ts
 * app.use(express.json({ limit, verify: keepRawBody }))
 * ```
 */
export function keepRawBody(request: IncomingMessage, _response: unknown, body: Buffer): void {
  if (request.url?.startsWith(KEPT_UNDER)) bodies.set(request, body)
}

/**
 * The bytes a call's body came as, as text, or `null` for a call that
 * kept none: one with no body, or one not to the echo.
 *
 * @param request - The call
 * @returns The body, as it came
 * @example
 * ```ts
 * rawBodyOf(req) // "apiVersion=v2&name=John"
 * ```
 */
export function rawBodyOf(request: IncomingMessage): string | null {
  return bodies.get(request)?.toString("utf8") ?? null
}

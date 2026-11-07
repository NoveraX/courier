"use server"

import { createAction } from "@noverax/courier-next"
import { sources } from "@/api"
import { type TracedAnswer, traced } from "@/site/inspector/server/traced"

/* Each call a sandbox may run on the server, as its page shows it, and the values its input takes. */
const ERROR_CODES: ReadonlySet<number> = new Set([400, 401, 403, 404, 422, 500, 502, 503])
const TIMEOUTS: ReadonlySet<number> = new Set([1000, 2000, 5000])

const api = createAction(sources, "api")
const middlewareApi = createAction(sources, "middlewareApi")
const encodedApi = createAction(sources, "encodedApi")

/** The calls a sandbox may run on the server, by name. */
export type ServerRunName =
  | "middleware.users"
  | "errors.error"
  | "options.slow"
  | "encoding.json"
  | "encoding.form"

/** What a run came to, or why none was made. */
export type ServerRun = TracedAnswer<unknown> | { readonly refused: string }

const VARIABLES = { name: "John", role: "admin" }

/* A number of those a call takes, or `undefined` for any other input. */
function oneOf(input: unknown, taken: ReadonlySet<number>): number | undefined {
  return typeof input === "number" && taken.has(input) ? input : undefined
}

/**
 * Run one of the examples' calls on the site's server, in this Server
 * Action, as a sandbox's switch asks: the same call its page runs in the
 * browser, made with the visitor's session and address as `createAction`
 * takes them, and traced. Only the calls named here run, each with an
 * input from its page's own choices; any other name or input is refused
 * without a call. Each call takes from the visitor's budget, which the
 * backend keeps whatever path a call takes.
 *
 * @param name - The call
 * @param input - Its input: the error code, the timeout
 * @returns What it came to and its trace, or why it was refused
 * @example
 * ```ts
 * const run = await runOnServer("errors.error", 404)
 * ```
 */
export async function runOnServer(name: ServerRunName, input?: unknown): Promise<ServerRun> {
  switch (name) {
    case "middleware.users":
      return traced("action", () => middlewareApi.users.getAll(), { failures: "answer" })
    case "errors.error": {
      const code = oneOf(input, ERROR_CODES)
      if (code === undefined) return { refused: "That code is not one the page offers" }
      return traced("action", () => api.misc.error({ code }), { failures: "answer" })
    }
    case "options.slow": {
      const timeout = oneOf(input, TIMEOUTS)
      if (timeout === undefined) return { refused: "That timeout is not one the page offers" }
      return traced("action", () => api.misc.with({ timeout }).slow(), { failures: "answer" })
    }
    case "encoding.json":
      return traced("action", () => api.echo.send(VARIABLES), { failures: "answer" })
    case "encoding.form":
      return traced("action", () => encodedApi.echo.send(VARIABLES), { failures: "answer" })
    default:
      return { refused: "No such call" }
  }
}

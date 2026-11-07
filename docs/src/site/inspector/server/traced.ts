import { answerOf, type ServerAnswer } from "../../sandbox/server-call"
import type { CallSite, CallTrace } from "../trace"
import { requestInspection } from "./inspection"
import { recordCalls, withCallLog } from "./recorder"
import { serverTraceOf } from "./trace-of"

/* The site's setting, read once: whether calls made on the server are traced. */
const INSPECTING = requestInspection(process.env)

/** What a call made on the server came to, and its trace where the inspector is on. */
export interface TracedAnswer<TData> {
  readonly answer: ServerAnswer<TData>
  readonly trace?: CallTrace | undefined
}

/**
 * Make a call on the site's server — as a page renders, or in a Server
 * Action — and trace it as the proxy route traces its calls: each request
 * to the API, the headers by name, the chain, and how long it took. What
 * it came to is its data, or the API's refusal, as `answerOf` gives it.
 *
 * @param site - Where the call is made
 * @param call - The call
 * @param on - Whether the inspector is on: the site's setting, unless a test says
 * @returns What the call came to, and its trace
 * @throws Whatever the call failed with that is no answer of the API's
 * @example
 * ```ts
 * const users = await traced("render", () => caller.users.getAll())
 * ```
 */
export async function traced<TData>(
  site: Exclude<CallSite, "proxy">,
  call: () => Promise<TData>,
  on = INSPECTING
): Promise<TracedAnswer<TData>> {
  if (!on) return { answer: await answerOf(call()) }
  recordCalls()
  const { value: answer, log } = await withCallLog(() => answerOf(call()))
  return { answer, trace: serverTraceOf(log, site) }
}

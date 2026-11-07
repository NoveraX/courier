import { isCourierError } from "@noverax/courier/server"

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

/** How a traced call is made. */
export interface TracedOptions {
  /**
   * What a failure of Courier's own — no answer, or none in time — comes
   * to: thrown, as any other failure is (the default), or told as the
   * call's answer, its trace kept, as a sandbox shows it.
   */
  readonly failures?: "throw" | "answer" | undefined
  /** Whether the inspector is on: the site's setting, unless a test says. */
  readonly on?: boolean | undefined
}

/* What the call came to: its data or the API's refusal, and a failure of Courier's own told as one
   where the call asks. */
async function settled<TData>(
  call: () => Promise<TData>,
  failures: TracedOptions["failures"]
): Promise<ServerAnswer<TData>> {
  try {
    return await answerOf(call())
  } catch (failure) {
    if (failures !== "answer" || !isCourierError(failure)) throw failure
    /* Its kind alone: its message may name the API's own address, which the trace leaves out too. */
    return { error: `${failure.name}: no answer from the API`, status: 0 }
  }
}

/**
 * Make a call on the site's server — as a page renders, or in a Server
 * Action — and trace it as the proxy route traces its calls: each request
 * to the API, the headers by name, the chain, and how long it took. What
 * it came to is its data, or the API's refusal, as `answerOf` gives it.
 *
 * @param site - Where the call is made
 * @param call - The call
 * @param options - What a failure of Courier's own comes to, and whether the inspector is on
 * @returns What the call came to, and its trace
 * @throws Whatever the call failed with that is no answer of the API's, unless told as one
 * @example
 * ```ts
 * const users = await traced("render", () => caller.users.getAll())
 * ```
 */
export async function traced<TData>(
  site: Exclude<CallSite, "proxy">,
  call: () => Promise<TData>,
  { failures = "throw", on = INSPECTING }: TracedOptions = {}
): Promise<TracedAnswer<TData>> {
  if (!on) return { answer: await settled(call, failures) }
  recordCalls()
  const { value: answer, log } = await withCallLog(() => settled(call, failures))
  return { answer, trace: serverTraceOf(log, site) }
}

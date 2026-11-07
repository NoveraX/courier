import { redact } from "@noverax/courier/server"

import type { ApiAttempt, ChainLink } from "../trace"
import { headerNames } from "./header-names"

/* The most of each kind a log keeps, and the most events it takes in all. */
const MOST = { attempts: 6, chain: 8, log: 4, cache: 4, events: 64 } as const
/* The longest a line or a variables' preview is kept, before the trace cuts it shorter. */
const MOST_TEXT = 1000

/* How an attempt that got no status ended, as the core says it. */
function outcomeOf(status: number | undefined, message: string): string {
  if (status !== undefined) return String(status)
  if (/timed out/i.test(message)) return "timeout"
  if (/cancel/i.test(message)) return "cancelled"
  return "no-answer"
}

/* An address's path and query, a secret in it masked, its scheme, host and port left out. */
function targetOf(url: string): string {
  try {
    const { pathname, search } = new URL(redact(url))
    return `${pathname}${search}`
  } catch {
    return "?"
  }
}

/* An attempt being made: when it was sent, what it asked. */
interface Sending {
  readonly method: string
  readonly target: string
  readonly at: number
}

/**
 * What the site's server keeps of one call while it serves it, from the
 * core's events: its variables as the proxy read them, each request to the
 * API, the headers each way, the chain, its log lines and the cache's
 * word. Each kind is kept to its limit, as are the events in all; what
 * goes past them is counted. It keeps names, never a header's value.
 */
export class CallLog {
  readonly start: number
  readonly attempts: ApiAttempt[] = []
  readonly chain: (ChainLink & { index: number })[] = []
  readonly lines: string[] = []
  readonly cacheWords: string[] = []
  sentHeaders: string[] = []
  answerHeaders: string[] = []
  variables: string | undefined
  cut = 0
  #events = 0
  #sending: Sending | undefined

  /**
   * @param now - The clock, in ms; the log starts at its reading now
   */
  constructor(readonly now: () => number = () => performance.now()) {
    this.start = now()
  }

  /* Whether the log still takes an event: one past its limits is counted instead. */
  #takes(list?: readonly unknown[], most?: number): boolean {
    this.#events += 1
    const full = this.#events > MOST.events || (list !== undefined && list.length >= (most ?? 0))
    if (full) this.cut += 1
    return !full
  }

  /** The call's variables were read, as the core describes them: a form by its fields, a stream by its type. */
  parsed(variables: unknown): void {
    if (!this.#takes()) return
    const shown = JSON.stringify(redact(variables)) ?? "undefined"
    this.variables = shown.slice(0, MOST_TEXT)
  }

  /** A request to the API is being sent. */
  fetchStarted(method: string, url: string): void {
    if (!this.#takes()) return
    this.#sending = {
      method: method.toUpperCase(),
      target: targetOf(url),
      at: this.now() - this.start,
    }
  }

  /** The API answered the request being sent. */
  fetchEnded(status: number): void {
    this.#ended(String(status))
  }

  /** The request being sent failed: the API answered with an error, or no answer came. */
  fetchFailed(status: number | undefined, message: string): void {
    this.#ended(outcomeOf(status, message))
  }

  #ended(outcome: string): void {
    const sending = this.#sending
    this.#sending = undefined
    if (sending === undefined || !this.#takes(this.attempts, MOST.attempts)) return
    const ms = this.now() - this.start - sending.at
    this.attempts.push({ ...sending, outcome, ms })
  }

  /** The headers the call sent the API, where the core tells them, and those the API answered with. */
  answered(
    sent: Readonly<Record<string, string>> | undefined,
    answered?: Readonly<Record<string, string>>
  ): void {
    if (!this.#takes()) return
    if (sent !== undefined) {
      const out = headerNames(sent)
      this.sentHeaders = out.names
      this.cut += out.cut
    }
    if (answered === undefined) return
    const back = headerNames(answered)
    this.answerHeaders = back.names
    this.cut += back.cut
  }

  /** A middleware of the chain finished, at its place in the chain. */
  link(name: string, index: number, phase: string, ms: number, added: readonly string[]): void {
    if (!this.#takes(this.chain, MOST.chain)) return
    const lowered = added.map((header) => header.toLowerCase())
    this.chain.push({ name, phase, ms, added: lowered, index })
    this.chain.sort((one, other) => one.index - other.index)
  }

  /** A line the call's middleware logged. */
  line(text: string): void {
    if (this.#takes(this.lines, MOST.log)) this.lines.push(text.slice(0, MOST_TEXT))
  }

  /** How the server's cache took the call: `miss`, `store <ttl>`, `hit <age>`. */
  cache(entry: string): void {
    if (this.#takes(this.cacheWords, MOST.cache)) this.cacheWords.push(entry)
  }
}

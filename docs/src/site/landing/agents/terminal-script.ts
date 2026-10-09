import {
  type CallProgress,
  SESSION_MIDDLEWARE,
  SESSION_PROMPT,
  SESSION_REPLY,
} from "./session-script"

/** What the agent says before each call, and after the last. */
export const TERMINAL_LINES = [
  "I'll find Ada's orders first.",
  "Her newest order, o_7f2a, has not shipped yet. Cancelling it.",
  SESSION_REPLY,
] as const

/** Where the person's answer to the server's question stands. */
export type ConfirmChoice = "hidden" | "decline" | "confirm" | "confirmed"

/** The terminal at one moment of its loop. */
export interface TerminalFrame {
  /** How many characters of the prompt are typed into the input. */
  readonly typed: number
  /** The prompt was sent: it shows in the transcript, and the input is empty again. */
  readonly sent: boolean
  /** The agent is working before it says anything. */
  readonly working: boolean
  /** How many characters of each of the agent's lines show. */
  readonly said: readonly number[]
  /** Each call: whether its line shows, and how far it has gone through the server. */
  readonly calls: readonly CallProgress[]
  readonly confirm: ConfirmChoice
  /** One of `- \ | /`, turning while something runs. */
  readonly spinner: string
}

/** The loop's length, in ticks of 100 ms. */
export const TERMINAL_TICKS = 190
/** A moment where everything has happened, for a reader who asked for less motion. */
export const TERMINAL_STILL = 160

const SPINNER = ["-", "\\", "|", "/"] as const
const TYPE = { from: 6, perTick: 2 } as const
const SENT_AT = 32
const SAY = [
  { from: 40, perTick: 4 },
  { from: 64, perTick: 4 },
  { from: 116, perTick: 4 },
] as const
const CALLS = [
  { shown: 48, answered: 49 },
  { shown: 80, answered: 99 },
] as const
const CONFIRM = { asked: 81, chose: 91, confirmed: 98 } as const
const STAGE_TICKS = 3

function shown(at: number, from: number, perTick: number, length: number): number {
  return Math.max(0, Math.min(length, (at - from) * perTick))
}

function callProgress(at: number, call: { shown: number; answered: number }): CallProgress {
  if (at < call.shown) return "unmade"
  if (at < call.answered) return "waiting"
  const stage = Math.floor((at - call.answered) / STAGE_TICKS)
  return stage > SESSION_MIDDLEWARE.length ? "done" : stage
}

function confirmChoice(at: number): ConfirmChoice {
  if (at < CONFIRM.asked) return "hidden"
  if (at < CONFIRM.chose) return "decline"
  return at < CONFIRM.confirmed ? "confirm" : "confirmed"
}

/**
 * The terminal at a tick of its loop: the prompt typed and sent, the agent
 * working, saying what it will do, its first call answered, its second
 * waiting on the server's question — answered by the person, safe choice
 * first — then answered, and the agent's reply.
 *
 * @param tick - Ticks of 100 ms since the session started; it loops
 * @returns The frame
 * @example
 * ```ts
 * terminalFrame(TERMINAL_STILL).confirm // "confirmed"
 * ```
 */
export function terminalFrame(tick: number): TerminalFrame {
  const at = tick % TERMINAL_TICKS
  return {
    typed: shown(at, TYPE.from, TYPE.perTick, SESSION_PROMPT.length),
    sent: at >= SENT_AT,
    working: at >= SENT_AT + 1 && at < SAY[0].from,
    said: TERMINAL_LINES.map((line, index) =>
      shown(at, SAY[index]?.from ?? 0, SAY[index]?.perTick ?? 1, line.length)
    ),
    calls: CALLS.map((call) => callProgress(at, call)),
    confirm: confirmChoice(at),
    spinner: SPINNER[at % SPINNER.length] ?? "-",
  }
}

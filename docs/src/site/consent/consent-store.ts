import type { ConsentChoice } from "./consent-config"
import { type ConsentStorage, readConsent, writeConsent } from "./consent-record"

/** What the page knows of the reader's answer. */
export interface ConsentState {
  /** Whether the kept answer has been read: never on the server, whose render asks nothing. */
  known: boolean
  /** The reader's answer while it holds, or the one their browser gives for them. */
  choice: ConsentChoice | undefined
  /** Whether the question is on the screen. */
  asking: boolean
  /** How many times the reader asked for the question again, from Cookie settings. */
  asks: number
}

/** What the store reads the answer from. */
export interface ConsentEnvironment {
  storage: ConsentStorage | undefined
  /** Whether the browser asks sites not to track: Global Privacy Control or Do Not Track. */
  declinesTracking: boolean
  /** The time now, in milliseconds since the epoch. */
  now: () => number
}

/** The reader's answer, for `useSyncExternalStore`, and the ways to change it. */
export interface ConsentStore {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => ConsentState
  /** Keeps the reader's answer and puts the question away. */
  decide: (choice: ConsentChoice) => void
  /** Puts the question on the screen again, or brings the reader to it where it is up already. */
  ask: () => void
  /** Reads the kept answer again, which another tab may have changed. */
  refresh: () => void
}

/** The page before it knows anything: the server's render, and the browser's first. */
export const UNKNOWN_CONSENT: ConsentState = {
  known: false,
  choice: undefined,
  asking: false,
  asks: 0,
}

/* A browser that asks sites not to track has answered for its reader: no, until the reader
   says otherwise from Cookie settings. */
function kept({ storage, declinesTracking, now }: ConsentEnvironment, asks: number): ConsentState {
  const choice = readConsent(storage, now())?.choice
  if (choice) return { known: true, choice, asking: false, asks }
  return declinesTracking
    ? { known: true, choice: "denied", asking: false, asks }
    : { known: true, choice: undefined, asking: true, asks }
}

/**
 * The reader's answer to whether the site may count their visits, read
 * from the browser the first time the page asks for it — never during the
 * server's render, so a page cached for every reader carries no answer.
 *
 * @param environment - Where the answer is kept, what the browser asks for, and the clock
 * @returns The store
 * @example
 * ```ts
 * const store = createConsentStore({ storage: consentStorage(), declinesTracking: false, now: Date.now })
 * store.decide("granted")
 * ```
 */
export function createConsentStore(environment: ConsentEnvironment): ConsentStore {
  const listeners = new Set<() => void>()
  let state: ConsentState | undefined
  const set = (next: ConsentState) => {
    state = next
    for (const listener of listeners) listener()
  }
  const current = () => {
    state ??= kept(environment, 0)
    return state
  }
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: current,
    decide(choice) {
      writeConsent(environment.storage, choice, environment.now())
      set({ known: true, choice, asking: false, asks: current().asks })
    },
    ask() {
      set({ ...current(), asking: true, asks: current().asks + 1 })
    },
    refresh() {
      const next = kept(environment, current().asks)
      if (next.choice !== current().choice) set(next)
    },
  }
}

import { randomBytes } from "node:crypto"

import { Refusal, wholeSeconds } from "../refusal"
import { copyOfSeed, SEED } from "./seed"
import type { DemoData, DemoView } from "./types"

/** How many visitors' data the store keeps, and for how long. */
export interface SandboxLimits {
  /** Visitors whose data is kept at once; past them, the one unused the longest goes, once not in use. */
  readonly visitors: number
  /** How long a visitor's data is kept unused. */
  readonly idleMs: number
  /** How long a visitor's data is kept at all, used or not. */
  readonly lifetimeMs: number
  /** How long a visitor's data is in use once they last used it: kept, however full the store. */
  readonly inUseMs: number
}

/** What a change came to, and the visitor it was made for. */
export interface Changed<TResult> {
  readonly result: TResult
  /** The visitor's id: theirs already, or one made for them with their first change. */
  readonly visitor: string
  /** Whether the id was made with this change, and the visitor has yet to be handed it. */
  readonly made: boolean
}

interface Sandbox {
  readonly data: DemoData
  readonly createdAt: number
  usedAt: number
}

/* The longest delay a timer keeps: past it, Node fires at once. */
const LONGEST_WAIT_MS = 2 ** 31 - 1

/**
 * Each visitor's data, kept apart. A visitor with none reads the
 * examples' first data, which no call changes; their first change that
 * goes through is made to a copy of it, which becomes theirs under an id
 * the store makes — 128 random bits, never one a caller names. A visitor's
 * data goes once it has been unused for `idleMs` — every call of theirs
 * uses it, a change that throws too — and after `lifetimeMs` in any case:
 * at that moment, whether a call comes or not, by a timer that runs only
 * while the store keeps anyone's data, and keeps no process running.
 * The store never holds more than `visitors` copies: a new one takes the
 * room of the data unused the longest, once that has gone unused for
 * `inUseMs`, and is refused while every visitor's data is in use.
 *
 * @example
 * ```ts
 * const store = new SandboxStore({ visitors: 500, idleMs: 1_800_000, lifetimeMs: 7_200_000, inUseMs: 300_000 })
 * const { result, visitor, made } = store.change(undefined, (data) => data.users.delete(1))
 * store.read(visitor).users.has(1) // false — and true for everyone else
 * ```
 */
export class SandboxStore {
  readonly #limits: SandboxLimits
  readonly #makeId: () => string
  /* In the order they were last used: the first is the one unused the longest. */
  readonly #byUse = new Map<string, Sandbox>()
  /* In the order they were made: the first is the oldest. */
  readonly #byAge = new Map<string, Sandbox>()
  /* Set for when the first of them is due to go, and only while there is any. */
  #timer: ReturnType<typeof setTimeout> | undefined

  /**
   * @param limits - How many visitors' data to keep, and for how long
   * @param makeId - Makes a new visitor's id
   * @throws RangeError for limits a store could not keep: no visitor, no time, or less than none in use
   */
  constructor(
    limits: SandboxLimits,
    makeId: () => string = () => randomBytes(16).toString("base64url")
  ) {
    const { visitors, idleMs, lifetimeMs, inUseMs } = limits
    if (!Number.isSafeInteger(visitors) || visitors < 1 || !(idleMs > 0) || !(lifetimeMs > 0)) {
      throw new RangeError("A store keeps at least one visitor's data, for some time")
    }
    if (!(inUseMs >= 0)) throw new RangeError("A visitor's data is in use for 0 ms or more")
    this.#limits = limits
    this.#makeId = makeId
  }

  /** How many visitors' data the store holds. */
  get size(): number {
    return this.#byUse.size
  }

  /**
   * Whether the store keeps data for a visitor, so that a change of theirs
   * makes them no copy. Asking does not use their data.
   *
   * @param visitor - The visitor's id, if their call carried one
   * @returns Whether their data is kept
   */
  keeps(visitor: string | undefined): boolean {
    this.#dropDue(Date.now())
    return visitor !== undefined && this.#byUse.has(visitor)
  }

  /**
   * Make sure the store has room for one more visitor's data: it holds
   * fewer than it may, or the data unused the longest is no longer in use.
   *
   * @throws Refusal 503 `STORE_FULL`, with when there will be room, while every visitor's data is in use
   */
  checkRoom(): void {
    const now = Date.now()
    this.#dropDue(now)
    if (this.#byUse.size < this.#limits.visitors) return
    const oldest = this.#byUse.values().next()
    const wait = oldest.done ? 0 : oldest.value.usedAt + this.#limits.inUseMs - now
    if (wait <= 0) return
    const seconds = wholeSeconds(wait)
    throw new Refusal(
      503,
      "STORE_FULL",
      `The examples keep as many visitors' data as they can; try again in ${seconds} s`,
      seconds
    )
  }

  /**
   * The data a visitor's calls read.
   *
   * @param visitor - The visitor's id, if their call carried one
   * @returns Their data, or the examples' first data when the store keeps none for them
   */
  read(visitor: string | undefined): DemoView {
    return this.#use(visitor)?.data ?? SEED
  }

  /**
   * Make a change to a visitor's data — to a copy of the first data when
   * the store keeps none for them. A change that throws leaves everything
   * as it was, and keeps no copy; so does one the store has no room for.
   *
   * @param visitor - The visitor's id, if their call carried one
   * @param change - What to change, returning what the call answers
   * @returns What the change returned, and the visitor's id
   * @throws Refusal 503 `STORE_FULL` for a copy while every visitor's data is in use
   */
  change<TResult>(
    visitor: string | undefined,
    change: (data: DemoData) => TResult
  ): Changed<TResult> {
    const kept = this.#use(visitor)
    if (kept !== undefined && visitor !== undefined) {
      return { result: change(kept.data), visitor, made: false }
    }
    const data = copyOfSeed()
    const result = change(data)
    this.checkRoom()
    const made = this.#makeId()
    const now = Date.now()
    if (this.#byUse.size >= this.#limits.visitors) this.#dropUnusedLongest()
    const sandbox: Sandbox = { data, createdAt: now, usedAt: now }
    this.#byUse.set(made, sandbox)
    this.#byAge.set(made, sandbox)
    this.#schedule()
    return { result, visitor: made, made: true }
  }

  /* The visitor's data, marked as used now, after dropping the data no one may use any more. */
  #use(visitor: string | undefined): Sandbox | undefined {
    const now = Date.now()
    this.#dropDue(now)
    const sandbox = visitor === undefined ? undefined : this.#byUse.get(visitor)
    if (sandbox === undefined || visitor === undefined) return undefined
    sandbox.usedAt = now
    this.#byUse.delete(visitor)
    this.#byUse.set(visitor, sandbox)
    return sandbox
  }

  /* What has idled too long is at the front of one order, and what is too old at the front of the
     other. */
  #dropDue(now: number): void {
    const { idleMs, lifetimeMs } = this.#limits
    for (const [visitor, sandbox] of this.#byUse) {
      if (now - sandbox.usedAt < idleMs) break
      this.#drop(visitor)
    }
    for (const [visitor, sandbox] of this.#byAge) {
      if (now - sandbox.createdAt < lifetimeMs) break
      this.#drop(visitor)
    }
  }

  #dropUnusedLongest(): void {
    const unusedLongest = this.#byUse.keys().next()
    if (!unusedLongest.done) this.#drop(unusedLongest.value)
  }

  #drop(visitor: string): void {
    this.#byUse.delete(visitor)
    this.#byAge.delete(visitor)
    if (this.#byUse.size > 0) return
    /* Nothing is left to wait for. */
    clearTimeout(this.#timer)
    this.#timer = undefined
  }

  /* One timer for every visitor's data, set for when the first is due to go. No call makes that
     sooner — a new copy is due no sooner than any other, and a use only puts its own time off —
     so the timer is set again only once it has run; run early, it finds nothing due and waits
     again. */
  #schedule(): void {
    if (this.#timer !== undefined) return
    const unusedLongest = this.#byUse.values().next()
    const oldest = this.#byAge.values().next()
    if (unusedLongest.done || oldest.done) return
    const due = Math.min(
      unusedLongest.value.usedAt + this.#limits.idleMs,
      oldest.value.createdAt + this.#limits.lifetimeMs
    )
    this.#timer = setTimeout(
      () => {
        this.#timer = undefined
        this.#dropDue(Date.now())
        this.#schedule()
      },
      Math.min(Math.max(due - Date.now(), 0), LONGEST_WAIT_MS)
    )
    this.#timer.unref()
  }
}

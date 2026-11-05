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

/**
 * Each visitor's data, kept apart. A visitor with none reads the
 * examples' first data, which no call changes; their first change that
 * goes through is made to a copy of it, which becomes theirs under an id
 * the store makes — 128 random bits, never one a caller names. A visitor's
 * data goes once it has been unused for `idleMs` — every call of theirs
 * uses it, a change that throws too — and after `lifetimeMs` in any case.
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
  readonly #now: () => number
  readonly #makeId: () => string
  /* In the order they were last used: the first is the one unused the longest. */
  readonly #sandboxes = new Map<string, Sandbox>()

  /**
   * @param limits - How many visitors' data to keep, and for how long
   * @param now - The time, in milliseconds
   * @param makeId - Makes a new visitor's id
   * @throws RangeError for limits a store could not keep: no visitor, no time, or less than none in use
   */
  constructor(
    limits: SandboxLimits,
    now: () => number = Date.now,
    makeId: () => string = () => randomBytes(16).toString("base64url")
  ) {
    const { visitors, idleMs, lifetimeMs, inUseMs } = limits
    if (!Number.isSafeInteger(visitors) || visitors < 1 || !(idleMs > 0) || !(lifetimeMs > 0)) {
      throw new RangeError("A store keeps at least one visitor's data, for some time")
    }
    if (!(inUseMs >= 0)) throw new RangeError("A visitor's data is in use for 0 ms or more")
    this.#limits = limits
    this.#now = now
    this.#makeId = makeId
  }

  /** How many visitors' data the store holds. */
  get size(): number {
    return this.#sandboxes.size
  }

  /**
   * Whether the store keeps data for a visitor, so that a change of theirs
   * makes them no copy. Asking does not use their data.
   *
   * @param visitor - The visitor's id, if their call carried one
   * @returns Whether their data is kept
   */
  keeps(visitor: string | undefined): boolean {
    const now = this.#now()
    this.#dropIdle(now)
    const sandbox = visitor === undefined ? undefined : this.#sandboxes.get(visitor)
    return sandbox !== undefined && now - sandbox.createdAt < this.#limits.lifetimeMs
  }

  /**
   * Make sure the store has room for one more visitor's data: it holds
   * fewer than it may, or the data unused the longest is no longer in use.
   *
   * @throws Refusal 503 `STORE_FULL`, with when there will be room, while every visitor's data is in use
   */
  checkRoom(): void {
    const now = this.#now()
    this.#dropIdle(now)
    if (this.#sandboxes.size < this.#limits.visitors) return
    const oldest = this.#sandboxes.values().next()
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
    const now = this.#now()
    if (this.#sandboxes.size >= this.#limits.visitors) this.#dropOldest()
    this.#sandboxes.set(made, { data, createdAt: now, usedAt: now })
    return { result, visitor: made, made: true }
  }

  /* The visitor's data, marked as used now, after dropping the data no one may use any more. */
  #use(visitor: string | undefined): Sandbox | undefined {
    const now = this.#now()
    this.#dropIdle(now)
    const sandbox = visitor === undefined ? undefined : this.#sandboxes.get(visitor)
    if (sandbox === undefined || visitor === undefined) return undefined
    this.#sandboxes.delete(visitor)
    if (now - sandbox.createdAt >= this.#limits.lifetimeMs) return undefined
    sandbox.usedAt = now
    this.#sandboxes.set(visitor, sandbox)
    return sandbox
  }

  /* Data is kept in the order it was last used, so what has idled too long is at the front. */
  #dropIdle(now: number): void {
    for (const [visitor, sandbox] of this.#sandboxes) {
      if (now - sandbox.usedAt < this.#limits.idleMs) return
      this.#sandboxes.delete(visitor)
    }
  }

  #dropOldest(): void {
    const oldest = this.#sandboxes.keys().next()
    if (!oldest.done) this.#sandboxes.delete(oldest.value)
  }
}

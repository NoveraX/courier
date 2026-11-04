/**
 * Each visitor's data is their own. A visitor with none reads the
 * examples' first data; their first change that goes through makes them a
 * copy under an id the store makes; the copy goes once it idles too long,
 * once it is too old, or — past the store's visitors — when it is the one
 * unused the longest. Time is the test's own clock, never waited for.
 */
import { describe, expect, it } from "vitest"

import { addUser } from "../../server/data/records"
import { type SandboxLimits, SandboxStore } from "../../server/data/sandbox-store"
import { SEED } from "../../server/data/seed"
import type { DemoView } from "../../server/data/types"
import { Refusal } from "../../server/refusal"
import { below, seeded } from "./random"

const LIMITS: SandboxLimits = { visitors: 3, idleMs: 1000, lifetimeMs: 5000 }

function storeOn(clock: { now: number }, limits = LIMITS): SandboxStore {
  let made = 0
  const makeId = () => {
    made += 1
    return `visitor-${made}`
  }
  return new SandboxStore(limits, () => clock.now, makeId)
}

function names(data: DemoView): string[] {
  return [...data.users.values()].map((user) => user.name)
}

const add = (name: string) => (data: Parameters<typeof addUser>[0]) =>
  addUser(data, { name, email: `${name}@example.com`, role: "user" }, { most: 30, at: new Date(0) })

describe("a visitor with no data of their own", () => {
  it("reads the examples' first data, and is kept nothing for reading it", () => {
    const store = storeOn({ now: 0 })
    expect(store.read(undefined)).toBe(SEED)
    expect(store.size).toBe(0)
  })

  it("is made a copy of the first data by their first change, under an id the store makes", () => {
    const store = storeOn({ now: 0 })
    const { result, visitor, made } = store.change(undefined, add("jane"))
    expect(made).toBe(true)
    expect(visitor).toBe("visitor-1")
    expect(result.id).toBe(4)
    expect(names(store.read(visitor))).toEqual([...names(SEED), "jane"])
    expect(names(SEED)).toEqual(["Alice Johnson", "Bob Smith", "Carol Williams"])
  })

  it("is kept nothing by a change that throws", () => {
    const store = storeOn({ now: 0 })
    const refused = new Refusal(404, "NOT_FOUND", "No user #9")
    expect(() =>
      store.change(undefined, () => {
        throw refused
      })
    ).toThrow(refused)
    expect(store.size).toBe(0)
  })

  it("never has an id they name themselves taken for theirs", () => {
    const store = storeOn({ now: 0 })
    expect(store.read("visitor-1")).toBe(SEED)
    const { visitor, made } = store.change("chosen-by-the-caller", add("jane"))
    expect(made).toBe(true)
    expect(visitor).not.toBe("chosen-by-the-caller")
    expect(store.read("chosen-by-the-caller")).toBe(SEED)
  })
})

describe("a visitor's data", () => {
  it("is theirs alone", () => {
    const store = storeOn({ now: 0 })
    const jane = store.change(undefined, add("jane")).visitor
    const john = store.change(undefined, add("john")).visitor
    store.change(jane, (data) => data.users.delete(1))
    expect(names(store.read(jane))).toEqual(["Bob Smith", "Carol Williams", "jane"])
    expect(names(store.read(john))).toEqual([...names(SEED), "john"])
    expect(store.read(undefined)).toBe(SEED)
  })

  it("goes once it has been unused for the idle time, and stays while it is used", () => {
    const clock = { now: 0 }
    const store = storeOn(clock)
    const { visitor } = store.change(undefined, add("jane"))
    clock.now = 999
    expect(names(store.read(visitor))).toContain("jane")
    clock.now = 1998
    expect(names(store.read(visitor))).toContain("jane")
    clock.now = 2998
    expect(store.read(visitor)).toBe(SEED)
    expect(store.size).toBe(0)
  })

  it("goes at the end of its lifetime, however much it is used", () => {
    const clock = { now: 0 }
    const store = storeOn(clock)
    const { visitor } = store.change(undefined, add("jane"))
    for (clock.now = 900; clock.now < 5000; clock.now += 900) {
      expect(names(store.read(visitor))).toContain("jane")
    }
    clock.now = 5000
    expect(store.read(visitor)).toBe(SEED)
    expect(store.change(visitor, add("again")).made).toBe(true)
  })

  it("goes first when it is the one unused the longest, once the store is full", () => {
    const clock = { now: 0 }
    const store = storeOn(clock)
    const first = store.change(undefined, add("a")).visitor
    clock.now = 10
    const second = store.change(undefined, add("b")).visitor
    clock.now = 20
    const third = store.change(undefined, add("c")).visitor
    clock.now = 30
    store.read(first)
    store.change(undefined, add("d"))
    expect(store.size).toBe(3)
    expect(store.read(second)).toBe(SEED)
    expect(names(store.read(first))).toContain("a")
    expect(names(store.read(third))).toContain("c")
  })

  it("is refused a store that could keep no one", () => {
    expect(() => new SandboxStore({ visitors: 0, idleMs: 1, lifetimeMs: 1 })).toThrow(RangeError)
    expect(() => new SandboxStore({ visitors: 1, idleMs: 0, lifetimeMs: 1 })).toThrow(RangeError)
  })
})

describe("any run of visitors' calls", () => {
  it("keeps each visitor's data from the others', the first data unchanged, and no more than it may", () => {
    const first = JSON.stringify([...SEED.users.values(), ...SEED.posts.values()])
    for (let seed = 1; seed <= 20; seed += 1) {
      const next = seeded(seed)
      const clock = { now: 0 }
      const store = storeOn(clock, { visitors: 4, idleMs: 50, lifetimeMs: 200 })
      const ids = new Map<number, { id: string; createdAt: number; usedAt: number }>()
      for (let call = 0; call < 2000; call += 1) {
        clock.now += below(next, 12)
        const slot = below(next, 8)
        const known = ids.get(slot)
        const label = `seed ${seed}, call ${call}, visitor ${slot}`
        if (below(next, 3) === 0) {
          const data = store.read(known?.id)
          const expired =
            known !== undefined &&
            (clock.now - known.usedAt >= 50 || clock.now - known.createdAt >= 200)
          for (const name of names(data).filter((written) => written.startsWith("v"))) {
            expect(name.split("-")[0], label).toBe(`v${slot}`)
          }
          if (expired) expect(data, label).toBe(SEED)
          if (known !== undefined && data !== SEED) known.usedAt = clock.now
          continue
        }
        /* A call counts as a use of the visitor's data whether or not its change goes through. */
        if (known !== undefined) known.usedAt = clock.now
        try {
          const { visitor, made } = store.change(known?.id, (data) => {
            if (below(next, 4) === 0) throw new Refusal(404, "NOT_FOUND", "gone")
            return add(`v${slot}-${call}`)(data)
          })
          if (made) ids.set(slot, { id: visitor, createdAt: clock.now, usedAt: clock.now })
        } catch (error) {
          if (!(error instanceof Refusal)) throw error
        }
        expect(store.size, label).toBeLessThanOrEqual(4)
      }
    }
    expect(JSON.stringify([...SEED.users.values(), ...SEED.posts.values()])).toBe(first)
  })
})

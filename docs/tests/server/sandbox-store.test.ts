/**
 * Each visitor's data is their own. A visitor with none reads the
 * examples' first data; their first change that goes through makes them a
 * copy under an id the store makes; the copy goes once it idles too long,
 * once it is too old, or — past the store's visitors — when it is the one
 * unused the longest and no longer in use. A copy goes at its time by
 * itself, whether a call comes or not, as the privacy notice says. Data in
 * use is never dropped for a new copy, which is refused instead. Time is
 * the test's own clock, never waited for, and the store's timer runs on it.
 */
import { readFileSync } from "node:fs"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { addUser } from "../../server/data/records"
import { type SandboxLimits, SandboxStore } from "../../server/data/sandbox-store"
import { SEED } from "../../server/data/seed"
import type { DemoView } from "../../server/data/types"
import { DEMO_LIMITS } from "../../server/limits"
import { Refusal } from "../../server/refusal"
import { below, seeded } from "./random"

const LIMITS: SandboxLimits = { visitors: 3, idleMs: 1000, lifetimeMs: 5000, inUseMs: 100 }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
})

afterEach(() => {
  vi.useRealTimers()
})

function storeOn(limits = LIMITS): SandboxStore {
  let made = 0
  const makeId = () => {
    made += 1
    return `visitor-${made}`
  }
  return new SandboxStore(limits, makeId)
}

/* The clock moves on to `ms`, and every timer due by then runs, as it would have. */
function at(ms: number): void {
  vi.advanceTimersByTime(ms - Date.now())
}

function names(data: DemoView): string[] {
  return [...data.users.values()].map((user) => user.name)
}

const add = (name: string) => (data: Parameters<typeof addUser>[0]) =>
  addUser(data, { name, email: `${name}@example.com`, role: "user" }, { most: 30, at: new Date(0) })

describe("a visitor with no data of their own", () => {
  it("reads the examples' first data, and is kept nothing for reading it", () => {
    const store = storeOn()
    expect(store.read(undefined)).toBe(SEED)
    expect(store.size).toBe(0)
  })

  it("is made a copy of the first data by their first change, under an id the store makes", () => {
    const store = storeOn()
    const { result, visitor, made } = store.change(undefined, add("jane"))
    expect(made).toBe(true)
    expect(visitor).toBe("visitor-1")
    expect(result.id).toBe(4)
    expect(names(store.read(visitor))).toEqual([...names(SEED), "jane"])
    expect(names(SEED)).toEqual(["Alice Johnson", "Bob Smith", "Carol Williams"])
  })

  it("is kept nothing by a change that throws", () => {
    const store = storeOn()
    const refused = new Refusal(404, "NOT_FOUND", "No user #9")
    expect(() =>
      store.change(undefined, () => {
        throw refused
      })
    ).toThrow(refused)
    expect(store.size).toBe(0)
  })

  it("is kept nothing, and so would be made a copy, until their first change", () => {
    const store = storeOn()
    expect(store.keeps(undefined)).toBe(false)
    const { visitor } = store.change(undefined, add("jane"))
    expect(store.keeps(visitor)).toBe(true)
    expect(store.keeps("visitor-2")).toBe(false)
  })

  it("never has an id they name themselves taken for theirs", () => {
    const store = storeOn()
    expect(store.read("visitor-1")).toBe(SEED)
    const { visitor, made } = store.change("chosen-by-the-caller", add("jane"))
    expect(made).toBe(true)
    expect(visitor).not.toBe("chosen-by-the-caller")
    expect(store.read("chosen-by-the-caller")).toBe(SEED)
  })
})

describe("a visitor's data", () => {
  it("is theirs alone", () => {
    const store = storeOn()
    const jane = store.change(undefined, add("jane")).visitor
    const john = store.change(undefined, add("john")).visitor
    store.change(jane, (data) => data.users.delete(1))
    expect(names(store.read(jane))).toEqual(["Bob Smith", "Carol Williams", "jane"])
    expect(names(store.read(john))).toEqual([...names(SEED), "john"])
    expect(store.read(undefined)).toBe(SEED)
  })

  it("goes once it has been unused for the idle time, and stays while it is used", () => {
    const store = storeOn()
    const { visitor } = store.change(undefined, add("jane"))
    at(999)
    expect(names(store.read(visitor))).toContain("jane")
    at(1998)
    expect(names(store.read(visitor))).toContain("jane")
    at(2998)
    expect(store.read(visitor)).toBe(SEED)
    expect(store.size).toBe(0)
  })

  it("goes at the end of its lifetime, however much it is used", () => {
    const store = storeOn()
    const { visitor } = store.change(undefined, add("jane"))
    for (let time = 900; time < 5000; time += 900) {
      at(time)
      expect(names(store.read(visitor))).toContain("jane")
    }
    at(5000)
    expect(store.read(visitor)).toBe(SEED)
    expect(store.change(visitor, add("again")).made).toBe(true)
  })

  it("goes first when it is the one unused the longest, once the store is full and it is no longer in use", () => {
    const store = storeOn()
    const first = store.change(undefined, add("a")).visitor
    at(10)
    const second = store.change(undefined, add("b")).visitor
    at(20)
    const third = store.change(undefined, add("c")).visitor
    at(110)
    store.read(first)
    store.change(undefined, add("d"))
    expect(store.size).toBe(3)
    expect(store.read(second)).toBe(SEED)
    expect(names(store.read(first))).toContain("a")
    expect(names(store.read(third))).toContain("c")
  })

  it("stays while it is in use, a new visitor's copy refused instead, with when there will be room", () => {
    const store = storeOn()
    const visitors = ["a", "b", "c"].map((name) => {
      vi.advanceTimersByTime(10)
      return store.change(undefined, add(name)).visitor
    })
    at(50)

    let refused: unknown
    try {
      store.change(undefined, add("d"))
    } catch (error) {
      refused = error
    }
    expect(refused).toBeInstanceOf(Refusal)
    expect(refused).toMatchObject({ status: 503, code: "STORE_FULL", retryAfter: 1 })
    expect(() => store.checkRoom()).toThrow(Refusal)
    expect(store.size).toBe(3)
    expect(visitors.map((visitor) => names(store.read(visitor)).at(-1))).toEqual(["a", "b", "c"])

    at(160)
    expect(() => store.checkRoom()).not.toThrow()
    expect(store.change(undefined, add("d")).made).toBe(true)
    expect(store.read(visitors[0])).toBe(SEED)
  })

  it("is refused a store that could keep no one", () => {
    const limits = { visitors: 1, idleMs: 1, lifetimeMs: 1, inUseMs: 0 }
    expect(() => new SandboxStore({ ...limits, visitors: 0 })).toThrow(RangeError)
    expect(() => new SandboxStore({ ...limits, idleMs: 0 })).toThrow(RangeError)
    expect(() => new SandboxStore({ ...limits, inUseMs: -1 })).toThrow(RangeError)
  })
})

describe("a visitor's data, while no call comes", () => {
  it("goes once it has been unused for the idle time", () => {
    const store = storeOn()
    store.change(undefined, add("jane"))
    at(999)
    expect(store.size).toBe(1)
    at(1000)
    expect(store.size).toBe(0)
  })

  it("goes at the end of its lifetime, though it was used just before", () => {
    const store = storeOn()
    const { visitor } = store.change(undefined, add("jane"))
    for (let time = 900; time < 5000; time += 900) {
      at(time)
      store.read(visitor)
    }
    at(4999)
    expect(store.size).toBe(1)
    at(5000)
    expect(store.size).toBe(0)
  })

  it("goes at its own time, the sooner of its idle time's end and its lifetime's, whatever the others'", () => {
    const store = storeOn()
    /* Made first and used since: the one unused the longest is another, yet it goes first, at
       the end of its lifetime. */
    const first = store.change(undefined, add("a")).visitor
    for (let time = 900; time < 4200; time += 900) {
      at(time)
      store.read(first)
    }
    at(4200)
    store.change(undefined, add("b"))
    at(4500)
    store.read(first)
    at(4600)
    const third = store.change(undefined, add("c")).visitor
    at(4900)
    store.read(third)

    const gone: number[] = []
    for (let time = Date.now() + 1; time <= 10_000; time += 1) {
      const kept = store.size
      at(time)
      if (store.size < kept) gone.push(time)
    }
    /* The first at 0 + 5000; the second, never used, at 4200 + 1000; the third at 4900 + 1000. */
    expect(gone).toEqual([5000, 5200, 5900])
  })

  it("is waited for by one timer, which runs only while the store keeps anyone's data", () => {
    const store = storeOn()
    store.read(undefined)
    expect(() =>
      store.change(undefined, () => {
        throw new Refusal(404, "NOT_FOUND", "No user #9")
      })
    ).toThrow(Refusal)
    expect(vi.getTimerCount()).toBe(0)

    store.change(undefined, add("jane"))
    at(10)
    store.change(undefined, add("john"))
    expect(vi.getTimerCount()).toBe(1)
    at(1010)
    expect(store.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)

    /* Dropped by a call before the timer runs: it stops all the same. */
    store.change(undefined, add("jane"))
    vi.setSystemTime(Date.now() + LIMITS.idleMs)
    expect(store.read(undefined)).toBe(SEED)
    expect(store.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("keeps no process running while it waits", () => {
    vi.useRealTimers()
    const waiting = () => process.getActiveResourcesInfo().filter((kind) => kind === "Timeout")
    const before = waiting().length
    const store = storeOn()
    store.change(undefined, add("jane"))
    expect(store.size).toBe(1)
    expect(waiting()).toHaveLength(before)
  })
})

describe("the privacy notice", () => {
  it("says how long a visitor's entries are kept: as long as the store keeps them, though no call comes", () => {
    const { idleMs, lifetimeMs } = DEMO_LIMITS
    const store = new SandboxStore(DEMO_LIMITS)
    const jane = store.change(undefined, add("jane")).visitor
    store.change(undefined, add("john"))

    /* John stops at once; Jane goes on using the examples. */
    at(idleMs - 1)
    store.read(jane)
    expect(store.size).toBe(2)
    at(idleMs)
    expect(store.size).toBe(1)
    for (let time = 2 * (idleMs - 1); time < lifetimeMs; time += idleMs - 1) {
      at(time)
      store.read(jane)
    }
    at(lifetimeMs - 1)
    expect(store.size).toBe(1)
    at(lifetimeMs)
    expect(store.size).toBe(0)

    const notice = readFileSync(
      new URL("../../src/content/legal/privacy.mdx", import.meta.url),
      "utf8"
    )
    const [collects = ""] = notice.split("## How long")
    expect(collects).toContain(
      `is kept on our server for you alone: for ${lifetimeMs / 3_600_000} hours at most, and for ${idleMs / 60_000} minutes once you stop using the examples.`
    )
  })
})

describe("any run of visitors' calls", () => {
  it("keeps each visitor's data from the others', and in use, the first data unchanged, and no more than it may, nor past its time", () => {
    const first = JSON.stringify([...SEED.users.values(), ...SEED.posts.values()])
    for (let seed = 1; seed <= 20; seed += 1) {
      const next = seeded(seed)
      const store = storeOn({ visitors: 4, idleMs: 50, lifetimeMs: 200, inUseMs: 20 })
      const ids = new Map<number, { id: string; createdAt: number; usedAt: number }>()
      for (let call = 0; call < 2000; call += 1) {
        vi.advanceTimersByTime(below(next, 12))
        const now = Date.now()
        const slot = below(next, 8)
        const known = ids.get(slot)
        const label = `seed ${seed}, call ${call}, visitor ${slot}`
        /* Before the call: time alone has taken every copy past its time. */
        const live = [...ids.values()].filter(
          (copy) => now - copy.usedAt < 50 && now - copy.createdAt < 200
        )
        expect(store.size, label).toBeLessThanOrEqual(live.length)
        if (below(next, 3) === 0) {
          const data = store.read(known?.id)
          const expired =
            known !== undefined && (now - known.usedAt >= 50 || now - known.createdAt >= 200)
          const inUse =
            known !== undefined && now - known.usedAt < 20 && now - known.createdAt < 200
          for (const name of names(data).filter((written) => written.startsWith("v"))) {
            expect(name.split("-")[0], label).toBe(`v${slot}`)
          }
          if (expired) expect(data, label).toBe(SEED)
          if (inUse) expect(data, label).not.toBe(SEED)
          if (known !== undefined && data !== SEED) known.usedAt = now
          continue
        }
        try {
          const { visitor, made } = store.change(known?.id, (data) => {
            /* A call counts as a use of the visitor's data whether or not its change goes
               through: data of theirs holds a name of theirs, where a copy holds none. */
            if (known !== undefined && names(data).some((name) => name.startsWith(`v${slot}-`))) {
              known.usedAt = now
            }
            if (below(next, 4) === 0) throw new Refusal(404, "NOT_FOUND", "gone")
            return add(`v${slot}-${call}`)(data)
          })
          if (made) ids.set(slot, { id: visitor, createdAt: now, usedAt: now })
        } catch (error) {
          if (!(error instanceof Refusal)) throw error
        }
        expect(store.size, label).toBeLessThanOrEqual(4)
      }
    }
    expect(JSON.stringify([...SEED.users.values(), ...SEED.posts.values()])).toBe(first)
  })
})

/* The records a call goes through, as a map's iterators and its forEach hand them out: the work
   of the calls `run` makes, counted rather than timed, whatever else runs on the machine. */
function recordsVisited(run: () => void): number {
  const iterators: { next: (this: unknown) => unknown } = Object.getPrototypeOf(new Map().keys())
  const { next } = iterators
  const { forEach } = Map.prototype
  let visited = 0
  iterators.next = function (this: unknown) {
    visited += 1
    return next.call(this)
  }
  Map.prototype.forEach = function (this: Map<unknown, unknown>, each, thisArg) {
    forEach.call(this, (...args: Parameters<typeof each>) => {
      visited += 1
      each.apply(thisArg, args)
    })
  }
  try {
    run()
  } finally {
    iterators.next = next
    Map.prototype.forEach = forEach
  }
  return visited
}

/* The records each of the same calls goes through in a store that keeps `visitors` visitors'
   data, every one of them used in turn, and none idle long enough to go. The clock moves between
   the calls, outside what is counted: the fake clock keeps its own timers in a map. */
function perCall(visitors: number): number {
  const calls = 4_000
  const store = storeOn({ visitors, idleMs: 60_000, lifetimeMs: 600_000, inUseMs: 0 })
  const ids = Array.from({ length: visitors }, () => store.change(undefined, () => 0).visitor)
  let visited = 0
  for (let call = 0; call < calls; call += 1) {
    vi.advanceTimersByTime(1)
    const visitor = ids[(call * 7919) % visitors]
    visited += recordsVisited(() => {
      if (call % 2 === 0) store.read(visitor)
      else store.change(visitor, (data) => data.nextUserId)
    })
  }
  expect(store.size).toBe(visitors)
  return visited / calls
}

describe("the work of a call", () => {
  it("counts every record a map's iterators and forEach hand out", () => {
    const map = new Map([
      [1, "one"],
      [2, "two"],
    ])
    const seen: string[] = []
    expect(recordsVisited(() => Array.from(map.keys()))).toBe(3)
    expect(
      recordsVisited(() =>
        map.forEach((value) => {
          seen.push(value)
        })
      )
    ).toBe(2)
    expect(seen).toEqual(["one", "two"])
  })

  it("stays the same however many visitors' data the store keeps", () => {
    /* A store that went through every visitor's data on each call would go through a hundred
       times as many records for the larger; one that looks only at the data due to go first
       goes through the same few. */
    const few = perCall(50)
    expect(perCall(5_000)).toBe(few)
    expect(few).toBeLessThanOrEqual(2)
  })
})

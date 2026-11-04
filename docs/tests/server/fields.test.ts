/**
 * The backend reads every field a page sends into `unknown` and lets
 * through only what fits: whatever the value, a reader either returns one
 * that keeps its limit or refuses it with `INVALID_FIELD` — it never fails
 * otherwise. Each property runs over values drawn from fixed seeds, and a
 * failure names its seed and value.
 */
import { describe, expect, it } from "vitest"

import { email, fieldsOf, role, text, wholeNumber } from "../../server/fields"
import { Refusal } from "../../server/refusal"
import { anyValue, seeded } from "./random"

const SEEDS = Array.from({ length: 20 }, (_, index) => index + 1)
const RUNS = 500

function outcome(read: () => unknown): { value: unknown } | { refused: Refusal } {
  try {
    return { value: read() }
  } catch (error) {
    if (error instanceof Refusal) return { refused: error }
    throw error
  }
}

function eachValue(check: (value: unknown, label: string) => void): void {
  for (const seed of SEEDS) {
    const next = seeded(seed)
    for (let run = 0; run < RUNS; run += 1) {
      const value = anyValue(next)
      check(value, `seed ${seed}, value ${JSON.stringify(value)}`)
    }
  }
}

describe("a field of text", () => {
  it("is let through trimmed, within its limit and with no control character, or refused", () => {
    eachValue((value, label) => {
      const read = outcome(() => text(value, "name", 80))
      if ("refused" in read) {
        expect(read.refused.code, label).toBe("INVALID_FIELD")
        return
      }
      expect(typeof read.value, label).toBe("string")
      const kept = String(read.value)
      expect(kept.length, label).toBeGreaterThan(0)
      expect(kept.length, label).toBeLessThanOrEqual(80)
      expect(kept, label).toBe(kept.trim())
      expect(/\p{Cc}/u.test(kept), label).toBe(false)
    })
  })

  it("keeps a name as it was written, but for the spaces around it", () => {
    expect(text("  Jane Doe ", "name", 80)).toBe("Jane Doe")
    expect(text("Zoë 😀", "name", 80)).toBe("Zoë 😀")
  })
})

describe("an e-mail address", () => {
  it("is let through as an address of one @ and a dotted domain, or refused", () => {
    eachValue((value, label) => {
      const read = outcome(() => email(value, 254))
      if ("refused" in read) {
        expect(read.refused.code, label).toBe("INVALID_FIELD")
        return
      }
      expect(String(read.value), label).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    })
  })
})

describe("a whole number", () => {
  it("is let through as a safe whole number in its range, or refused", () => {
    eachValue((value, label) => {
      const read = outcome(() => wholeNumber(value, "id", { min: 1, max: 10_000 }))
      if ("refused" in read) {
        expect(read.refused.code, label).toBe("INVALID_FIELD")
        return
      }
      expect(Number.isSafeInteger(read.value), label).toBe(true)
      expect(read.value, label).toBeGreaterThanOrEqual(1)
      expect(read.value, label).toBeLessThanOrEqual(10_000)
    })
  })

  it("reads digits as a path or a query writes them, and nothing JavaScript would also read", () => {
    expect(wholeNumber("42", "id", { min: 1, max: 100 })).toBe(42)
    expect(wholeNumber(42, "id", { min: 1, max: 100 })).toBe(42)
    for (const written of ["4e1", "0x2a", " 42", "42 ", "042", "+42", "42.0", "", "Infinity"]) {
      expect(
        outcome(() => wholeNumber(written, "id", { min: 1, max: 100 })),
        written
      ).toHaveProperty("refused")
    }
  })
})

describe("a role and a body", () => {
  it("lets through the roles there are and refuses every other value", () => {
    eachValue((value, label) => {
      const read = outcome(() => role(value))
      if ("value" in read) expect(["admin", "user", "moderator"], label).toContain(read.value)
    })
  })

  it("reads a body as fields only when it is an object of them", () => {
    eachValue((value, label) => {
      const read = outcome(() => fieldsOf(value))
      const isObject = typeof value === "object" && value !== null && !Array.isArray(value)
      expect("value" in read, label).toBe(isObject)
      if ("refused" in read) expect(read.refused.code, label).toBe("INVALID_BODY")
    })
  })
})

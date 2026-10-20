/**
 * The reader's answer to whether the site may count their visits, kept in
 * the browser. An answer holds for about six months and only for the
 * question asked now; what the storage holds is the reader's to change, so
 * anything else reads as no answer, and a browser that refuses storage
 * keeps nothing.
 */
import { describe, expect, it, vi } from "vitest"

import { CONSENT_KEY, CONSENT_MAX_AGE_MS, CONSENT_VERSION } from "@/site/consent/consent-config"
import type { ConsentStorage } from "@/site/consent/consent-record"
import { readConsent, writeConsent } from "@/site/consent/consent-record"

const NOW = Date.UTC(2026, 9, 21, 12)
const DAY = 24 * 60 * 60 * 1000

function memoryStorage(initial?: string): ConsentStorage & { kept: Map<string, string> } {
  const kept = new Map<string, string>(initial === undefined ? [] : [[CONSENT_KEY, initial]])
  return {
    kept,
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
    removeItem: (key) => void kept.delete(key),
  }
}

function stored(record: Record<string, unknown>): string {
  return JSON.stringify(record)
}

describe("the kept answer", () => {
  it("is read back as it was given, to the question asked now", () => {
    const storage = memoryStorage()

    writeConsent(storage, "granted", NOW)

    expect(JSON.parse(storage.kept.get(CONSENT_KEY) ?? "")).toEqual({
      version: CONSENT_VERSION,
      choice: "granted",
      decided: NOW,
    })
    expect(readConsent(storage, NOW + DAY)).toEqual({
      version: CONSENT_VERSION,
      choice: "granted",
      decided: NOW,
    })
  })

  it("keeps a refusal as well as an agreement", () => {
    const storage = memoryStorage()

    writeConsent(storage, "denied", NOW)

    expect(readConsent(storage, NOW)?.choice).toBe("denied")
  })

  it("is no answer once it is older than six months", () => {
    const storage = memoryStorage()
    writeConsent(storage, "granted", NOW)

    expect(readConsent(storage, NOW + CONSENT_MAX_AGE_MS)?.choice).toBe("granted")
    expect(readConsent(storage, NOW + CONSENT_MAX_AGE_MS + 1)).toBeUndefined()
  })

  it("is no answer when it was given to an older question", () => {
    const storage = memoryStorage(
      stored({ version: CONSENT_VERSION - 1, choice: "granted", decided: NOW })
    )

    expect(readConsent(storage, NOW)).toBeUndefined()
  })

  it("holds across a clock set back by hours, and not when it seems given days from now", () => {
    const hoursAhead = memoryStorage(
      stored({ version: CONSENT_VERSION, choice: "denied", decided: NOW + 3_600_000 })
    )
    const daysAhead = memoryStorage(
      stored({ version: CONSENT_VERSION, choice: "denied", decided: NOW + 2 * DAY })
    )

    expect(readConsent(hoursAhead, NOW)?.choice).toBe("denied")
    expect(readConsent(daysAhead, NOW)).toBeUndefined()
  })

  it("is no answer when the storage holds anything else", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const shapes = [
      "not json",
      "null",
      "[]",
      stored({ version: CONSENT_VERSION, choice: "maybe", decided: NOW }),
      stored({ version: CONSENT_VERSION, choice: "granted", decided: "yesterday" }),
      stored({ version: CONSENT_VERSION, choice: "granted" }),
      stored({ version: String(CONSENT_VERSION), choice: "granted", decided: NOW }),
      stored({ version: CONSENT_VERSION, choice: "granted", decided: Number.NaN }),
    ]

    for (const shape of shapes)
      expect(readConsent(memoryStorage(shape), NOW), shape).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it("is no answer where there is no storage, and keeping one there fails quietly", () => {
    expect(readConsent(undefined, NOW)).toBeUndefined()
    expect(writeConsent(undefined, "granted", NOW).choice).toBe("granted")
  })

  it("is no answer when the browser refuses to read or keep it, and says why", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const refusing: ConsentStorage = {
      getItem: () => {
        throw new Error("SecurityError")
      },
      setItem: () => {
        throw new Error("QuotaExceededError")
      },
      removeItem: () => {
        throw new Error("SecurityError")
      },
    }

    expect(readConsent(refusing, NOW)).toBeUndefined()
    expect(writeConsent(refusing, "denied", NOW).choice).toBe("denied")
    expect(warn).toHaveBeenCalledTimes(3)
    warn.mockRestore()
  })

  it("does not let an earlier yes stand for a no the browser will not keep", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const storage = memoryStorage()
    writeConsent(storage, "granted", NOW)
    const full: ConsentStorage = {
      ...storage,
      setItem: () => {
        throw new Error("QuotaExceededError")
      },
    }

    writeConsent(full, "denied", NOW + DAY)

    expect(readConsent(storage, NOW + DAY)).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

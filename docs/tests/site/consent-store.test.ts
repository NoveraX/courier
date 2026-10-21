/**
 * What the page knows of the reader's answer: nothing until the browser is
 * asked, then the kept answer — or the question, when there is none. A
 * browser that asks sites not to track has answered for its reader, until
 * the reader says otherwise; an answer changes the page at once, and one
 * given in another tab reaches this one.
 */
import { describe, expect, it, vi } from "vitest"

import { CONSENT_KEY } from "@/site/consent/consent-config"
import type { ConsentStorage } from "@/site/consent/consent-record"
import { writeConsent } from "@/site/consent/consent-record"
import { createConsentStore, UNKNOWN_CONSENT } from "@/site/consent/consent-store"

const NOW = Date.UTC(2026, 9, 21, 12)

function memoryStorage(): ConsentStorage & { kept: Map<string, string> } {
  const kept = new Map<string, string>()
  return {
    kept,
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
    removeItem: (key) => void kept.delete(key),
  }
}

function store(storage: ConsentStorage, declinesTracking = false) {
  return createConsentStore({ storage, declinesTracking, now: () => NOW })
}

describe("the reader's answer", () => {
  it("is unknown to the server's render, which asks nothing", () => {
    expect(UNKNOWN_CONSENT).toEqual({ known: false, choice: undefined, asking: false, asks: 0 })
  })

  it("is asked for when none is kept", () => {
    expect(store(memoryStorage()).getSnapshot()).toEqual({
      known: true,
      choice: undefined,
      asking: true,
      asks: 0,
    })
  })

  it("is the kept one when there is one, and the question stays away", () => {
    const storage = memoryStorage()
    writeConsent(storage, "granted", NOW)

    expect(store(storage).getSnapshot()).toEqual({
      known: true,
      choice: "granted",
      asking: false,
      asks: 0,
    })
  })

  it("is no, without a question, from a browser that asks sites not to track", () => {
    expect(store(memoryStorage(), true).getSnapshot()).toEqual({
      known: true,
      choice: "denied",
      asking: false,
      asks: 0,
    })
  })

  it("is the reader's own once they agree, even where the browser asks sites not to track", () => {
    const storage = memoryStorage()
    const consent = store(storage, true)

    consent.ask()
    consent.decide("granted")

    expect(consent.getSnapshot()).toEqual({
      known: true,
      choice: "granted",
      asking: false,
      asks: 1,
    })
    expect(store(storage, true).getSnapshot().choice).toBe("granted")
  })

  it("is kept and tells the page at once, putting the question away", () => {
    const storage = memoryStorage()
    const consent = store(storage)
    const listener = vi.fn()
    consent.subscribe(listener)

    consent.decide("denied")

    expect(listener).toHaveBeenCalledTimes(1)
    expect(consent.getSnapshot()).toEqual({ known: true, choice: "denied", asking: false, asks: 0 })
    expect(JSON.parse(storage.kept.get(CONSENT_KEY) ?? "").choice).toBe("denied")
  })

  it("is asked for again from Cookie settings, keeping the answer until a new one", () => {
    const storage = memoryStorage()
    writeConsent(storage, "granted", NOW)
    const consent = store(storage)
    const listener = vi.fn()
    consent.subscribe(listener)

    consent.ask()

    expect(listener).toHaveBeenCalledTimes(1)
    expect(consent.getSnapshot()).toEqual({ known: true, choice: "granted", asking: true, asks: 1 })
  })

  it("tells the page each time Cookie settings asks, the question up already or not", () => {
    const consent = store(memoryStorage())
    const listener = vi.fn()
    consent.subscribe(listener)

    consent.ask()
    consent.ask()

    expect(listener).toHaveBeenCalledTimes(2)
    expect(consent.getSnapshot()).toMatchObject({ asking: true, asks: 2 })
  })

  it("is the same snapshot until it changes, as useSyncExternalStore requires", () => {
    const consent = store(memoryStorage())

    expect(consent.getSnapshot()).toBe(consent.getSnapshot())
  })

  it("follows an answer given in another tab, and ignores a reading that changes nothing", () => {
    const storage = memoryStorage()
    const here = store(storage)
    const listener = vi.fn()
    here.subscribe(listener)
    here.getSnapshot()

    here.refresh()
    writeConsent(storage, "granted", NOW)
    here.refresh()

    expect(listener).toHaveBeenCalledTimes(1)
    expect(here.getSnapshot()).toEqual({ known: true, choice: "granted", asking: false, asks: 0 })
  })

  it("stops telling a page that no longer listens", () => {
    const consent = store(memoryStorage())
    const listener = vi.fn()
    const unsubscribe = consent.subscribe(listener)

    unsubscribe()
    consent.decide("granted")

    expect(listener).not.toHaveBeenCalled()
  })
})

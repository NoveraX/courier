/**
 * The script that decides before the first paint whether the consent bar
 * shows decides as the consent store does once the page's code runs: the
 * bar shows when no answer holds, unless the browser asks sites not to
 * track — and where the storage refuses to be read, it shows.
 */
import { describe, expect, it } from "vitest"

import { CONSENT_BAR_ATTRIBUTE, consentBootstrap } from "@/site/consent/consent-bootstrap"
import {
  CONSENT_CLOCK_SKEW_MS,
  CONSENT_KEY,
  CONSENT_MAX_AGE_MS,
  CONSENT_VERSION,
} from "@/site/consent/consent-config"
import type { ConsentStorage } from "@/site/consent/consent-record"
import { createConsentStore } from "@/site/consent/consent-store"

const NOW = Date.UTC(2026, 9, 21, 12)
const DAY = 24 * 60 * 60 * 1000

interface Visit {
  /** What the browser keeps under the consent key, if anything. */
  kept?: string
  gpc?: boolean
  dnt?: string | null
  /** Whether the browser refuses the page its storage. */
  blocked?: boolean
}

function storageFor({ kept, blocked }: Visit): ConsentStorage {
  return {
    getItem: (key) => {
      if (blocked) throw new Error("SecurityError")
      return key === CONSENT_KEY ? (kept ?? null) : null
    },
    setItem: () => undefined,
    removeItem: () => undefined,
  }
}

function barBeforePaint(visit: Visit): boolean {
  const attributes = new Set<string>()
  const run = new Function("navigator", "localStorage", "document", "Date", consentBootstrap())
  run(
    { globalPrivacyControl: visit.gpc ?? false, doNotTrack: visit.dnt ?? null },
    storageFor(visit),
    { documentElement: { setAttribute: (name: string) => attributes.add(name) } },
    { now: () => NOW }
  )
  return attributes.has(CONSENT_BAR_ATTRIBUTE)
}

function barOnceTheCodeRuns(visit: Visit): boolean {
  return createConsentStore({
    storage: visit.blocked ? undefined : storageFor(visit),
    declinesTracking: visit.gpc === true || visit.dnt === "1",
    now: () => NOW,
  }).getSnapshot().asking
}

const answer = (fields: Record<string, unknown>) =>
  JSON.stringify({ version: CONSENT_VERSION, choice: "granted", decided: NOW - DAY, ...fields })

const VISITS: Record<string, Visit> = {
  "a first visit": {},
  "a yes given yesterday": { kept: answer({}) },
  "a no given yesterday": { kept: answer({ choice: "denied" }) },
  "a yes at the very end of its term": { kept: answer({ decided: NOW - CONSENT_MAX_AGE_MS }) },
  "a yes past its term": { kept: answer({ decided: NOW - CONSENT_MAX_AGE_MS - 1 }) },
  "a yes to an older question": { kept: answer({ version: CONSENT_VERSION - 1 }) },
  "a yes from hours ahead of the clock": { kept: answer({ decided: NOW + 3_600_000 }) },
  "a yes from days ahead of the clock": {
    kept: answer({ decided: NOW + CONSENT_CLOCK_SKEW_MS + 1 }),
  },
  "an answer that is not one": { kept: answer({ choice: "maybe" }) },
  "a date that is not one": { kept: answer({ decided: "yesterday" }) },
  "something that is not JSON": { kept: "not json" },
  "a browser that sends Global Privacy Control": { gpc: true },
  "a browser that sends Do Not Track": { dnt: "1" },
  "a browser that blocks the site's storage": { blocked: true },
}

describe("the consent bar before the first paint", () => {
  it("shows for a first visit, and not once an answer holds", () => {
    expect(barBeforePaint(VISITS["a first visit"] ?? {})).toBe(true)
    expect(barBeforePaint(VISITS["a yes given yesterday"] ?? {})).toBe(false)
    expect(barBeforePaint(VISITS["a browser that sends Global Privacy Control"] ?? {})).toBe(false)
  })

  for (const [name, visit] of Object.entries(VISITS)) {
    it(`decides as the consent store does for ${name}`, () => {
      expect(barBeforePaint(visit)).toBe(barOnceTheCodeRuns(visit))
    })
  }
})

import {
  CONSENT_CLOCK_SKEW_MS,
  CONSENT_KEY,
  CONSENT_MAX_AGE_MS,
  CONSENT_VERSION,
  type ConsentChoice,
} from "./consent-config"

/** A reader's answer as the browser keeps it: to which question, what, and when. */
export interface ConsentRecord {
  version: number
  choice: ConsentChoice
  /** When the reader answered, in milliseconds since the epoch. */
  decided: number
}

/** Where the answer is kept: the browser's own storage. */
export type ConsentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

function isRecord(value: unknown): value is ConsentRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    typeof value.version === "number" &&
    "choice" in value &&
    (value.choice === "granted" || value.choice === "denied") &&
    "decided" in value &&
    typeof value.decided === "number" &&
    Number.isFinite(value.decided)
  )
}

/**
 * The browser's storage, where the page may use it: a browser that blocks
 * a site's storage throws as the page reaches for it, and the reader is
 * then asked on every page, as nothing can be kept.
 *
 * @returns The storage, or `undefined` where the page may not keep anything
 * @example
 * ```ts
 * readConsent(consentStorage(), Date.now())
 * ```
 */
export function consentStorage(): ConsentStorage | undefined {
  try {
    return window.localStorage
  } catch (error) {
    console.warn(
      "The analytics answer cannot be kept: the browser blocks this site's storage",
      error
    )
    return undefined
  }
}

/**
 * The reader's answer, while it holds: given to the question asked now,
 * within the last six months. What the storage holds is the reader's to
 * change, so anything else reads as no answer, and the reader is asked.
 *
 * @param storage - Where the answer is kept
 * @param now - The time now, in milliseconds since the epoch
 * @returns The answer, or `undefined` when there is none that holds
 * @example
 * ```ts
 * readConsent(consentStorage(), Date.now())?.choice // "granted"
 * ```
 */
export function readConsent(
  storage: ConsentStorage | undefined,
  now: number
): ConsentRecord | undefined {
  try {
    const kept: unknown = JSON.parse(storage?.getItem(CONSENT_KEY) ?? "null")
    if (!isRecord(kept) || kept.version !== CONSENT_VERSION) return undefined
    const age = now - kept.decided
    return age <= CONSENT_MAX_AGE_MS && age >= -CONSENT_CLOCK_SKEW_MS ? kept : undefined
  } catch (error) {
    console.warn("The analytics answer could not be read", error)
    return undefined
  }
}

/**
 * Keeps the reader's answer to the question asked now. Where the browser
 * will not keep it — its storage full — the earlier answer is removed
 * rather than left to stand for the new one, so the reader is asked again
 * instead of being counted after saying no.
 *
 * @param storage - Where the answer is kept
 * @param choice - The answer
 * @param now - The time now, in milliseconds since the epoch
 * @returns The answer as kept
 * @example
 * ```ts
 * writeConsent(consentStorage(), "denied", Date.now())
 * ```
 */
export function writeConsent(
  storage: ConsentStorage | undefined,
  choice: ConsentChoice,
  now: number
): ConsentRecord {
  const record: ConsentRecord = { version: CONSENT_VERSION, choice, decided: now }
  try {
    storage?.setItem(CONSENT_KEY, JSON.stringify(record))
  } catch (error) {
    console.warn("The analytics answer could not be kept", error)
    try {
      storage?.removeItem(CONSENT_KEY)
    } catch (cause) {
      console.warn("The earlier analytics answer could not be removed either", cause)
    }
  }
  return record
}

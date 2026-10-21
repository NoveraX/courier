"use client"

import { useSyncExternalStore } from "react"

import type { ConsentChoice } from "./consent-config"
import { CONSENT_KEY } from "./consent-config"
import { consentStorage } from "./consent-record"
import {
  type ConsentState,
  type ConsentStore,
  createConsentStore,
  UNKNOWN_CONSENT,
} from "./consent-store"

let store: ConsentStore | undefined
/* The control that asked the question again, which gets focus back once the reader answers. */
let asker: HTMLElement | null = null

function declinesTracking(): boolean {
  const browser: Navigator & { globalPrivacyControl?: boolean } = navigator
  return browser.globalPrivacyControl === true || browser.doNotTrack === "1"
}

function browserStore(): ConsentStore {
  if (store) return store
  const created = createConsentStore({
    storage: consentStorage(),
    declinesTracking: declinesTracking(),
    now: Date.now,
  })
  /* An answer given in another tab holds in this one as well. */
  window.addEventListener("storage", (event) => {
    if (event.key === CONSENT_KEY || event.key === null) created.refresh()
  })
  store = created
  return created
}

function subscribe(listener: () => void): () => void {
  return browserStore().subscribe(listener)
}

function snapshot(): ConsentState {
  return browserStore().getSnapshot()
}

function serverSnapshot(): ConsentState {
  return UNKNOWN_CONSENT
}

/**
 * The reader's answer to whether the site may count their visits: unknown
 * during the server's render and the hydration after it, then the answer
 * the browser keeps.
 *
 * @returns What the page knows of the answer
 * @example
 * ```tsx
 * const { known, choice, asking } = useConsent()
 * ```
 */
export function useConsent(): ConsentState {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}

/**
 * Keeps the reader's answer, puts the question away and gives focus back
 * to the control that asked it again, when one did and it is still on the
 * page.
 *
 * @param choice - The answer
 * @example
 * ```ts
 * decideConsent("denied")
 * ```
 */
export function decideConsent(choice: ConsentChoice): void {
  browserStore().decide(choice)
  if (asker?.isConnected) asker.focus()
  asker = null
}

/**
 * Puts the question on the screen again, for a reader who wants to change
 * the answer, and takes them to it — where it is up already as well.
 *
 * @param from - The control that asked, which gets focus back once the reader answers
 * @example
 * ```tsx
 * <button type="button" onClick={(event) => askConsent(event.currentTarget)}>Cookie settings</button>
 * ```
 */
export function askConsent(from: HTMLElement | null): void {
  asker = from
  browserStore().ask()
}

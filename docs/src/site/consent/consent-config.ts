/** A reader's answer to whether the site may count their visits. */
export type ConsentChoice = "granted" | "denied"

/** Where the answer is kept in the reader's browser, beside the site's other keys. */
export const CONSENT_KEY = "courier:analytics-consent"

/**
 * The version of what a reader agrees to. Raising it asks every reader
 * again: a change to what is collected, or to whom it goes, needs a new
 * answer, not the one given to the old question.
 */
export const CONSENT_VERSION = 1

/** How long an answer holds before the reader is asked again: about six months. */
export const CONSENT_MAX_AGE_MS = 182 * 24 * 60 * 60 * 1000

/** How far ahead of the reader's clock an answer may seem to be, after the clock is set back. */
export const CONSENT_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000

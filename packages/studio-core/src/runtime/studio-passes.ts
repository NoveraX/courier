import { STUDIO_PASS_REDEEMER } from "@noverax/courier/internal";
import { detectBrowser } from "./runtime-environment";

/* Long enough for a call to reach the app's proxy route; no longer. */
const PASS_LIFETIME_MS = 30_000;
/* More Playground calls than anyone runs at once; past it, the oldest pass goes. */
const MAX_PASSES = 256;
const PASS_BYTES = 32;

/* Every copy of this module in the process issues into, and redeems from, one book. */
const BOOK = Symbol.for("courier.studioPassBook");

interface Issued {
  requestId: string;
  expiresAt: number;
}

interface PassBook {
  /* Keyed by the pass itself: 256 random bits, so a lookup is no oracle for a guess. */
  issued: Map<string, Issued>;
}

/**
 * Issue a one-time pass for a Playground call to send to the app's proxy
 * route, which lets it past `browsersOnly` once. In a browser, whose own
 * `fetch` already says where a call comes from, there is no pass: the
 * header would only cost a preflight.
 *
 * @param requestId - The request Studio shows the call under
 * @returns The pass, or `undefined` in a browser
 * @example
 * ```ts
 * const pass = issueStudioPass(playgroundRequestId(rid));
 * ```
 */
export function issueStudioPass(requestId: string): string | undefined {
  if (detectBrowser()) return undefined;
  const book = passBook();
  const now = performance.now();
  forgetExpired(book, now);
  while (book.issued.size >= MAX_PASSES) {
    const oldest = book.issued.keys().next();
    if (oldest.done) break;
    book.issued.delete(oldest.value);
  }
  const pass = randomPass();
  book.issued.set(pass, { requestId, expiresAt: now + PASS_LIFETIME_MS });
  return pass;
}

/**
 * Forget every pass issued for a call, used or not: called once the
 * Playground's run of it has ended.
 *
 * @param requestId - The request Studio shows the call under
 * @example
 * ```ts
 * revokeStudioPasses(playgroundRequestId(rid));
 * ```
 */
export function revokeStudioPasses(requestId: string): void {
  const book = keptBook();
  if (book === undefined) return;
  for (const [pass, issued] of book.issued) {
    if (issued.requestId === requestId) book.issued.delete(pass);
  }
}

/* The book, if a pass was ever issued in this process: nothing redeems one before. */
function keptBook(): PassBook | undefined {
  const kept: unknown = Reflect.get(globalThis, BOOK);
  return isPassBook(kept) ? kept : undefined;
}

function passBook(): PassBook {
  const kept = keptBook();
  if (kept !== undefined) return kept;
  const book: PassBook = { issued: new Map() };
  Reflect.set(globalThis, BOOK, book);
  Reflect.set(globalThis, STUDIO_PASS_REDEEMER, (pass: unknown) => redeem(book, pass));
  return book;
}

/* A pass is spent the moment it is looked at, whatever it turns out to be. */
function redeem(book: PassBook, pass: unknown): boolean {
  if (typeof pass !== "string") return false;
  const issued = book.issued.get(pass);
  if (issued === undefined) return false;
  book.issued.delete(pass);
  return issued.expiresAt > performance.now();
}

/* Passes are issued with one lifetime, so the map holds them oldest first. */
function forgetExpired(book: PassBook, now: number): void {
  for (const [pass, issued] of book.issued) {
    if (issued.expiresAt > now) return;
    book.issued.delete(pass);
  }
}

function randomPass(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(PASS_BYTES));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function isPassBook(value: unknown): value is PassBook {
  if (typeof value !== "object" || value === null) return false;
  return Reflect.get(value, "issued") instanceof Map;
}

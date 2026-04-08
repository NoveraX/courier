/**
 * Validate that a string is a parseable HTTP(S) origin URL.
 *
 * `new URL(...)` accepts many schemes that are not safe to render or copy
 * to clipboard verbatim — `javascript:`, `data:`, `vbscript:`, `file:`,
 * `blob:`, and `about:` all parse successfully but expand the attack
 * surface for any UI that joins the value with a user-controlled path or
 * pastes it into an `href`. The wire format only ever carries an HTTP(S)
 * origin (the user app's address), so the protocol is whitelisted to
 * `http:` / `https:` only — anything else collapses to `false` and the
 * caller falls back to the relative-path display branch.
 *
 * Also rejects empty strings and non-string input so callers do not need
 * to pre-guard.
 */
export function isSafeHttpOrigin(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

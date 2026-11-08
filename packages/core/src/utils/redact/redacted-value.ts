import { defineOwn } from "../define-own";
import { isCredentialHeader } from "../is-credential-header";
import { CUT, REDACT_BOUNDS } from "./bounds";
import { headersWithoutSecrets } from "./headers";
import { REDACTED } from "./redacted";
import { readEach, redactedError } from "./redacted-error";
import { redactedText } from "./redacted-text";
import { isSecretValue } from "./secret-name";
import { attempt, FAILED, UNREADABLE } from "./unreadable";

/**
 * A value with what could be a credential cut out, as {@link redact} reads
 * it: a text by the patterns credentials take, `Headers` by their names, an
 * error, a list and a record part by part — an entry whose name says it is
 * secret hidden whole — and any other object as its kind alone, which no
 * secret can travel in. What held nothing to cut is the value itself, so a
 * log prints an error that carries no credential as the error it is.
 *
 * A value that cannot be read — a proxy whose traps throw, a revoked one —
 * is `[unreadable]`, and so is a part of one, the rest read as it is.
 *
 * @param value - The value
 * @param depth - How deep in the value this one lies
 * @param above - The objects that hold it, so a loop is cut where it repeats
 * @returns The value, or a copy with its credentials cut
 */
export function redactedValue(value: unknown, depth: number, above: ReadonlySet<object>): unknown {
  const shown = attempt(() => readValue(value, depth, above));
  return shown === FAILED ? UNREADABLE : shown;
}

function readValue(value: unknown, depth: number, above: ReadonlySet<object>): unknown {
  if (typeof value === "string") return redactedText(value);
  if (typeof value !== "object" || value === null) return value;
  if (above.has(value) || depth >= REDACT_BOUNDS.depth) return CUT;
  if (value instanceof Headers)
    return holdsCredential(value) ? headersWithoutSecrets(value) : value;
  if (value instanceof Date) return value;
  if (value instanceof URL) {
    const href = redactedText(value.href);
    return href === value.href ? value : href;
  }
  const below = new Set(above).add(value);
  const read = (part: unknown, field?: string): unknown =>
    field === undefined
      ? redactedValue(part, depth + 1, below)
      : redactedEntry(field, part, depth, below);
  if (value instanceof Error) return redactedError(value, read);
  if (Array.isArray(value)) return readEach(value, (item) => read(item));
  if (isPlainRecord(value)) return redactedRecord(value, read);
  return Object.prototype.toString.call(value);
}

function redactedRecord(
  record: Record<string, unknown>,
  read: (part: unknown, field: string) => unknown,
): Record<string, unknown> {
  const names = Object.keys(record);
  /* Each field read on its own: one whose getter throws is shown as unreadable, the rest as they are. */
  const kept = names.slice(0, REDACT_BOUNDS.width).map((name) => {
    const value = attempt(() => record[name]);
    return [name, value, value === FAILED ? UNREADABLE : read(value, name)] as const;
  });
  const cut = names.length > REDACT_BOUNDS.width;
  if (!cut && kept.every(([, value, shown]) => shown === value)) return record;
  const shown: Record<string, unknown> = {};
  for (const [name, , value] of kept) defineOwn(shown, name, value);
  if (cut) defineOwn(shown, "…", `${names.length - REDACT_BOUNDS.width} more`);
  return shown;
}

/* A name reads its value as an address, a text and a header read it: a strong one hides what it
   holds whatever it is, the weak one — `key` — only a value that reads as a credential, so
   `key: "id"` stays. */
function redactedEntry(
  name: string,
  value: unknown,
  depth: number,
  below: ReadonlySet<object>,
): unknown {
  if (isSecretValue(name, value)) return value === REDACTED ? value : REDACTED;
  return redactedValue(value, depth + 1, below);
}

function holdsCredential(headers: Headers): boolean {
  let holds = false;
  headers.forEach((value, name) => {
    holds ||= isCredentialHeader(name) || isSecretValue(name, value);
  });
  return holds;
}

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

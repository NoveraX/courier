/**
 * Where the values of an environment stand in a text. A value is found as
 * the variable holds it, and in the forms code writes it in: escaped in
 * JSON, encoded for an address, trimmed, and each line of a value of
 * several, such as a key in PEM. A value, or one of its forms, is found
 * where it is 8 characters long or more; a shorter one — `true`, a port —
 * would mask words of the message itself and is rarely a secret. A value
 * the code changed some other way — cut, encoded otherwise — is not found,
 * nor is one of a variable `shownVariables` shows. Each is found wherever
 * it stands, the same text found for two values that overlap included, so
 * no part of one is left where the other was found.
 */

import { shownVariables } from "./shown-variables";

/** An environment, as a process holds it. */
export type Environment = Readonly<Record<string, string | undefined>>;

/** A stretch of a text: the index of its first character, and of the one past its last. */
export type Span = readonly [start: number, end: number];

/** The shortest value found. */
const MIN_MASKED_LENGTH = 8;

/**
 * The stretches of a text that values of the environment stand in, in
 * order and apart: two that overlap or touch are one.
 *
 * @param text - The text, as the code wrote it
 * @param env - The environment
 * @param reach - Where a stretch starts at the latest: the rest of the text is read only as far as a value that starts before it runs
 * @returns The stretches
 * @example
 * ```ts
 * valueSpans("bad key s3cr3t-v4lue", { KEY: "s3cr3t-v4lue" }); // → [[8, 20]]
 * ```
 */
export function valueSpans(text: string, env: Environment, reach: number = text.length): Span[] {
  const shown = shownVariables(env);
  const values = new Set<string>();
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || value.length < MIN_MASKED_LENGTH || shown(name, value)) continue;
    for (const form of formsOf(value)) if (form.length >= MIN_MASKED_LENGTH) values.add(form);
  }
  const longest = Math.max(0, ...[...values].map((value) => value.length));
  const read = reach + longest < text.length ? text.slice(0, reach + longest) : text;
  const found: Span[] = [];
  for (const value of values) {
    for (let at = read.indexOf(value); at !== -1 && at < reach; at = read.indexOf(value, at + 1)) {
      found.push([at, at + value.length]);
    }
  }
  return joined(found);
}

/* A value, and the forms code writes it in: escaped in JSON, encoded for an address, trimmed, and
   each line of a value of several, trimmed too. */
function formsOf(value: string): string[] {
  const lines = value.split(/\r?\n/);
  return [
    value,
    JSON.stringify(value).slice(1, -1),
    encodeURIComponent(value),
    value.trim(),
    ...(lines.length > 1 ? lines.map((line) => line.trim()) : []),
  ];
}

/**
 * Stretches in order, each that overlaps or touches the one before it
 * joined to it.
 *
 * @param spans - The stretches, in any order
 * @returns The stretches, in order and apart
 * @example
 * ```ts
 * joined([[4, 9], [0, 2], [2, 3]]); // → [[0, 3], [4, 9]]
 * ```
 */
export function joined(spans: readonly Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const apart: Array<[number, number]> = [];
  for (const [start, end] of sorted) {
    const last = apart.at(-1);
    if (last !== undefined && start <= last[1]) last[1] = Math.max(last[1], end);
    else apart.push([start, end]);
  }
  return apart;
}

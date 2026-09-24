import type { MockDeclaration } from "../types";
import { quoteString } from "./quote-string";
import type { EntryContext, EntryField } from "./types";

/* The widest line an entry is written on before its fields go one per line. */
const MAX_LINE_WIDTH = 80;
/* The records per collection a mock server seeds when its declaration names no count. */
const DEFAULT_SEED_COUNT = 20;
/* An ASCII identifier name, reserved words included: a key or a member name written bare. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Write one entry of the mocks object: `key: defineMockServer({ ... })`. An
 * entry that would run past 80 columns at `indent`, a tab counting two, gets
 * one field per line, when the layout allows it.
 *
 * @param request - The mock to declare
 * @param ctx - How entries are written in the file
 * @param indent - The indentation the entry's first line starts at
 * @param mayBreak - Whether the entry may span lines
 * @returns The entry without its leading indentation or trailing comma
 *
 * @example
 * ```ts
 * renderEntry({ key: "api", source: "api", port: null, seedCount: 20, autoStart: true }, ctx, "  ", true);
 * // → "api: defineMockServer({ source: courierConfig.sources.api, autoStart: true })"
 * ```
 */
export function renderEntry(
  request: MockDeclaration,
  ctx: EntryContext,
  indent: string,
  mayBreak: boolean,
): string {
  const head = `${keyText(request.key, ctx)}: ${ctx.serverCallee}({`;
  const fields = entryFields(request, ctx).map((field) => `${field.name}: ${field.value}`);
  const inline = `${head} ${fields.join(", ")} })`;
  if (!mayBreak || columnWidth(indent) + columnWidth(inline) + 1 <= MAX_LINE_WIDTH) return inline;
  const { eol, indent: unit, trailingCommas } = ctx.style;
  const last = fields.length - 1;
  const lines = fields.map(
    (field, i) => `${indent}${unit}${field}${i < last || trailingCommas ? "," : ""}`,
  );
  return [head, ...lines, `${indent}})`].join(eol);
}

/**
 * The fields {@link renderEntry} writes into a mock's `defineMockServer`
 * call, which the audit expects to find: the source always, a port only when
 * one is held, a seed only when it differs from the default of 20,
 * `autoStart` only when set.
 *
 * @param request - The mock to declare
 * @param ctx - How entries are written in the file
 * @returns The fields, in the order they are written
 *
 * @example
 * ```ts
 * entryFields({ key: "api", source: "api", port: 4010, seedCount: 20, autoStart: false }, ctx);
 * // → [{ name: "source", value: "courierConfig.sources.api" }, { name: "port", value: "4010" }]
 * ```
 */
export function entryFields(request: MockDeclaration, ctx: EntryContext): EntryField[] {
  const fields: EntryField[] = [{ name: "source", value: sourceRef(request.source, ctx) }];
  if (request.port !== null) fields.push({ name: "port", value: String(request.port) });
  if (request.seedCount !== DEFAULT_SEED_COUNT) {
    fields.push({ name: "seed", value: `{ count: ${request.seedCount} }` });
  }
  if (request.autoStart) fields.push({ name: "autoStart", value: "true" });
  return fields;
}

function keyText(key: string, ctx: EntryContext): string {
  const bare = IDENTIFIER.test(key) && !(ctx.guardMocksColon && key.endsWith("mocks"));
  return bare ? key : literal(key, ctx);
}

function sourceRef(source: string, ctx: EntryContext): string {
  const sources = `${ctx.configLocal}.sources`;
  return IDENTIFIER.test(source) ? `${sources}.${source}` : `${sources}[${literal(source, ctx)}]`;
}

function literal(value: string, ctx: EntryContext): string {
  const quoted = quoteString(value, ctx.style.quote);
  return ctx.guardMocksColon ? quoted.replaceAll("mocks:", "mocks\\x3a") : quoted;
}

/* Columns as the line-length rule counts them: a tab is two, and an astral
   character one, as the iteration by code point gives it. */
function columnWidth(text: string): number {
  let width = 0;
  for (const char of text) width += char === "\t" ? 2 : 1;
  return width;
}

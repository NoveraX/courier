import type { Checked } from "./read-fields";
import { readFields } from "./read-fields";
import type { MockDeclaration } from "./types";

const DECLARATION_FIELDS = ["key", "source", "port", "seedCount", "autoStart"] as const;

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

function readString(value: unknown, path: string): Checked<string> {
  return typeof value === "string" ? { ok: true, value } : fail(`${path} must be a string`);
}

function readNumber(value: unknown, path: string): Checked<number> {
  return typeof value === "number" ? { ok: true, value } : fail(`${path} must be a number`);
}

function readPort(value: unknown, path: string): Checked<number | null> {
  if (value === null || typeof value === "number") return { ok: true, value };
  return fail(`${path} must be null or a number`);
}

function readBoolean(value: unknown, path: string): Checked<boolean> {
  return typeof value === "boolean" ? { ok: true, value } : fail(`${path} must be a boolean`);
}

/**
 * Reads one entry of a request's `mocks` array into a fresh declaration,
 * checking only its shape: exactly the five fields, each of its JSON type.
 * Whether the values can be declared — a key that is an identifier, a port
 * in range — is for {@link validateDeclarations}, which reports each problem
 * on the field it concerns.
 *
 * @param raw - The entry as it arrived.
 * @param index - Its position in `mocks`, for naming it in a message.
 * @returns The declaration, or a message naming the first field that is wrong.
 * @example
 * readMockDeclaration(
 *   { key: "users", source: "users", port: null, seedCount: 20, autoStart: true },
 *   0,
 * );
 * // { ok: true, value: { key: "users", source: "users", port: null, seedCount: 20, autoStart: true } }
 */
export function readMockDeclaration(raw: unknown, index: number): Checked<MockDeclaration> {
  const where = `mocks[${index}]`;
  const read = readFields(raw, where, DECLARATION_FIELDS);
  if (!read.ok) return read;
  const entry = read.value;
  const key = readString(entry.key, `${where}.key`);
  if (!key.ok) return key;
  const source = readString(entry.source, `${where}.source`);
  if (!source.ok) return source;
  const port = readPort(entry.port, `${where}.port`);
  if (!port.ok) return port;
  const seedCount = readNumber(entry.seedCount, `${where}.seedCount`);
  if (!seedCount.ok) return seedCount;
  const autoStart = readBoolean(entry.autoStart, `${where}.autoStart`);
  if (!autoStart.ok) return autoStart;
  const value = {
    key: key.value,
    source: source.value,
    port: port.value,
    seedCount: seedCount.value,
    autoStart: autoStart.value,
  } satisfies MockDeclaration;
  return { ok: true, value };
}

import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Fixture } from "./fixture";
import { fixturesToHar, harToFixtures } from "./fixture";
import { FixtureFileError } from "./fixture-file-error";
import type { HarLog } from "./har-format";

/**
 * Read the recordings a mock answers from, kept as a HAR file — the format
 * browsers' developer tools open. A file not written yet holds none.
 *
 * @param file - The HAR file's absolute path
 * @returns The recordings, in the order they were made
 * @throws {FixtureFileError} When the file is not a HAR log of Courier recordings
 * @example
 * ```ts
 * readFixtureFile("/app/fixtures/shop.har").length; // → 12
 * ```
 */
export function readFixtureFile(file: string): Fixture[] {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  const parsed = parseJson(text, file);
  if (!isCourierHar(parsed)) throw new FixtureFileError(file);
  return harToFixtures(parsed);
}

/**
 * Write the recordings to their HAR file in one step: written beside it,
 * then renamed over it, so a reader never sees half a file. Its folder is
 * created when it is missing.
 *
 * @param file - The HAR file's absolute path
 * @param fixtures - Every recording, in the order they were made
 * @example
 * ```ts
 * writeFixtureFile("/app/fixtures/shop.har", [...known, recorded]);
 * ```
 */
export function writeFixtureFile(file: string, fixtures: Fixture[]): void {
  mkdirSync(dirname(file), { recursive: true });
  const temp = join(dirname(file), `.${randomBytes(6).toString("hex")}.har.tmp`);
  try {
    writeFileSync(temp, `${JSON.stringify(fixturesToHar(fixtures), null, 2)}\n`);
    renameSync(temp, file);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

function parseJson(text: string, file: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new FixtureFileError(file, { cause: error });
  }
}

function isCourierHar(value: unknown): value is HarLog {
  if (!isObject(value) || !isObject(value.log) || !Array.isArray(value.log.entries)) return false;
  return value.log.entries.every(isCourierEntry);
}

function isCourierEntry(entry: unknown): boolean {
  if (!isObject(entry) || !isObject(entry._courier) || !isObject(entry.response)) return false;
  const { _courier: call, response } = entry;
  return (
    typeof call.group === "string" &&
    typeof call.method === "string" &&
    typeof response.status === "number" &&
    Array.isArray(response.headers) &&
    isObject(response.content) &&
    typeof response.content.text === "string" &&
    typeof entry.time === "number" &&
    typeof entry.startedDateTime === "string" &&
    isObject(entry.request) &&
    typeof entry.request.method === "string" &&
    typeof entry.request.url === "string"
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

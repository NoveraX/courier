import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type * as Testing from "@noverax/courier-mock/testing";

import { messageOf } from "../../server/message-of";
import { DEFAULT_RECORDINGS, findRecordings } from "../verify/find-recordings";
import type { RecordedImpact } from "./diff-report";

/**
 * What the recorded calls say of a change to the definition: how many each
 * endpoint has, and how many the new definition no longer fits — read from
 * the recordings named, or from `tests/recorded` when it exists. With none,
 * nothing is counted.
 *
 * @param root - The project root
 * @param path - The recordings named, if any
 * @param sources - The new definition's sources, which the recordings are checked against
 * @returns The counts
 * @throws {Error} When recordings are named but the mock package that reads them cannot load
 * @example
 * ```ts
 * const impact = await recordedImpact(root, undefined, config.sources);
 * ```
 */
export async function recordedImpact(
  root: string,
  path: string | undefined,
  sources: Readonly<Record<string, unknown>>,
): Promise<RecordedImpact> {
  const folder = path === undefined ? join(root, DEFAULT_RECORDINGS) : resolve(root, path);
  if (path === undefined && !existsSync(folder)) return { calls: new Map(), failing: undefined };
  const testing = await loadTesting();
  const { named, found } = findRecordings(root, [folder]);
  const recordings: Testing.Fixture[] = [];
  for (const file of [...named, ...found]) {
    try {
      recordings.push(...testing.readRecordings(file));
    } catch (error) {
      /* A browser's own HAR beside the recordings is no recording; one named outright must be. */
      if (named.includes(file)) throw error;
    }
  }
  const calls = new Map<string, number>();
  for (const recording of recordings) {
    const key = `${recording.source ?? ""} ${recording.group ? `${recording.group}.${recording.method}` : recording.method}`;
    calls.set(key, (calls.get(key) ?? 0) + 1);
  }
  const checks = await testing.verifyRecordings(sources, recordings);
  return { calls, failing: checks.filter((check) => check.problems.length > 0).length };
}

async function loadTesting(): Promise<typeof Testing> {
  try {
    return await import("@noverax/courier-mock/testing");
  } catch (error) {
    throw new Error(
      `Counting recorded calls needs @noverax/courier-mock, which could not be loaded: ${messageOf(error).split("\n", 1)[0]}`,
    );
  }
}

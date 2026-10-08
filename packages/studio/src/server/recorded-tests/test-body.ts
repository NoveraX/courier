import { isSessionId, readSaveBody } from "../session-body";
import { buildSession } from "../session-builder";
import type { SavedRequest } from "../session-types";
import { isObject } from "../validate-body";
import { RecordedTestRefusal } from "./recorded-test-refusal";

/** The folder a recorded test goes in when none is named. */
export const DEFAULT_TEST_FOLDER = "tests/recorded";

/** What a plan or a write of a recorded test is asked with. */
export interface TestBody {
  /** A saved session's id, whose calls the test checks */
  id?: string | undefined;
  /** Else the requests a page holds, as a save takes them */
  requests: SavedRequest[];
  title?: string | undefined;
  folder: string;
  /** The plan's digest the person saw, for a write */
  digest?: string | undefined;
  /** Whether a file already there may be replaced */
  replace: boolean;
}

/**
 * Read the body of a plan or a write: a saved session's id or the requests
 * a page holds — rebuilt as a save rebuilds them, credentials left out —
 * the test's title and folder, and for a write the digest seen and whether
 * a file there may be replaced.
 *
 * @param body - The request body, as parsed
 * @returns What it asks for
 * @throws {RecordedTestRefusal} `INVALID_REQUEST`, saying what is wrong
 * @example
 * ```ts
 * const asked = readTestBody(req.body);
 * ```
 */
export function readTestBody(body: unknown): TestBody {
  if (!isObject(body)) throw invalid("Send the test as a JSON object.");
  const { id, title, folder = DEFAULT_TEST_FOLDER, digest, replace = false } = body;
  if (id !== undefined && !isSessionId(id)) throw invalid("id must be a saved session's id.");
  if (
    title !== undefined &&
    (typeof title !== "string" || title.trim() === "" || title.length > 200)
  ) {
    throw invalid("title must be a name of 1 to 200 characters.");
  }
  if (typeof folder !== "string" || folder.trim() === "" || folder.length > 300) {
    throw invalid("folder must be a folder inside the project.");
  }
  if (digest !== undefined && typeof digest !== "string") throw invalid("digest must be a string.");
  if (typeof replace !== "boolean") throw invalid("replace must be true or false.");
  return {
    ...(id !== undefined && { id }),
    requests: id === undefined ? requestsOf(body.requests) : [],
    ...(title !== undefined && { title: title.trim() }),
    folder: folder.trim(),
    ...(digest !== undefined && { digest }),
    replace,
  };
}

function requestsOf(requests: unknown): SavedRequest[] {
  const read = readSaveBody({ requests });
  if ("error" in read) throw invalid(read.error);
  return buildSession(read).requests;
}

function invalid(message: string): RecordedTestRefusal {
  return new RecordedTestRefusal("INVALID_REQUEST", message);
}

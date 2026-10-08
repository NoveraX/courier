import { isPlainObject } from "../is-plain-object";
import type { SavedSession } from "../session-types";
import { scrubbedRequest } from "./scrub-secrets";
import type { SessionEnvironment } from "./session-environment";
import { readEnvironment } from "./session-environment";

/** What a session file says it is, so Studio opens no other JSON as one. */
export const SESSION_FILE_FORMAT = "courier-session";
const VERSION = 1;

/** A session as a file a colleague opens in their own Studio. */
export interface SessionFile {
  readonly format: typeof SESSION_FILE_FORMAT;
  readonly version: number;
  readonly exportedAt: number;
  readonly environment: SessionEnvironment;
  /** Every value replaced because its name says it is a secret, by where it was: `requests[2].variables.password`, `requests[0].url?token`. */
  readonly redactions: readonly string[];
  readonly session: SavedSession;
}

/**
 * A saved session as a file for a bug report: its requests with their
 * answers and timings — credential headers already left out when it was
 * built — every body field and query parameter named like a secret
 * replaced, the replaced ones listed for the person to look over before
 * sharing, and the environment it was recorded in.
 *
 * @param session - The session, as Studio builds one to save
 * @param environment - What it ran on
 * @param now - When it is exported
 * @returns The file
 * @example
 * ```ts
 * toSessionFile(buildSession(read), sessionEnvironment(root, sources));
 * ```
 */
export function toSessionFile(
  session: SavedSession,
  environment: SessionEnvironment,
  now = Date.now(),
): SessionFile {
  const redactions: string[] = [];
  const requests = session.requests.map((request, at) => scrubbedRequest(request, at, redactions));
  return {
    format: SESSION_FILE_FORMAT,
    version: VERSION,
    exportedAt: now,
    environment,
    redactions,
    session: { ...session, requests },
  };
}

/** What a session file holds, read as untrusted input: the session's parts, and its environment. */
export interface ReadSessionFile {
  readonly name: string;
  readonly requests: unknown;
  readonly apps: unknown;
  readonly environment?: SessionEnvironment | undefined;
}

/**
 * A session file read back: the parts a save is built from — checked and
 * rebuilt as any save is, since a file can hold anything — and the
 * environment it was recorded in.
 *
 * @param value - The parsed file
 * @returns Its parts, or why the file is not a session file
 * @example
 * ```ts
 * const read = readSessionFile(JSON.parse(text));
 * ```
 */
export function readSessionFile(value: unknown): ReadSessionFile | { error: string } {
  if (!isPlainObject(value) || value.format !== SESSION_FILE_FORMAT) {
    return { error: "This is not a Courier session file: it names no format courier-session" };
  }
  const version = value.version;
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1 ||
    version > VERSION
  ) {
    return {
      error: `This session file is version ${String(version)}; this Studio opens version ${VERSION}`,
    };
  }
  const session = value.session;
  if (!isPlainObject(session)) return { error: "This session file holds no session" };
  const environment = readEnvironment(value.environment);
  return {
    name: openedName(typeof session.name === "string" ? session.name.slice(0, 200) : "Session"),
    requests: session.requests,
    apps: session.apps ?? [],
    ...(environment && { environment }),
  };
}

const OPENED = " (opened from a file)";

/* A file shared on from a session opened from one keeps its name as it was. */
function openedName(name: string): string {
  return name.endsWith(OPENED) ? name : `${name}${OPENED}`;
}

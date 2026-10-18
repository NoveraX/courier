import { post } from "@/lib/api-client";
import { downloadFile } from "@/lib/export";
import { isPlainObject } from "@/socket/is-plain-object";
import { useStudioStore } from "@/store";
import { savedRequestOf } from "./saved-request";
import type { SessionEnvironment } from "./session-environment";
import { environmentOf } from "./session-environment";

/** Which requests a session file is made of: the ones the page shows, or a saved session. */
export type SessionFileTarget = { kind: "shown" } | { kind: "saved"; id: string };

/** A value Studio replaced in the file: the request it was in, and where in it. */
export interface Redaction {
  /** The request's place in the session, from 1. */
  at: number;
  endpoint: string;
  /** `variables.password`, `data.user.accessToken`, `url?token`. */
  field: string;
}

/** A session file Studio wrote, to look over before it is saved. */
export interface SessionFileDraft {
  /** The file as Studio wrote it — what is saved, unchanged. */
  file: unknown;
  name: string;
  /** Its calls, a read another call's request answered among them. */
  calls: number;
  /** The requests they sent. */
  requests: number;
  /** The requests that failed. */
  failed: number;
  environment: SessionEnvironment;
  redactions: Redaction[];
}

/* What Studio adds to the name of a session it opened from a file. */
const OPENED = / \(opened from a file\)$/;

/* The place Studio names a replaced value by: `requests[2].variables.password`, `requests[0].url?token`. */
const PLACE = /^requests\[(\d+)\]\.(.+)$/;

/**
 * Have Studio write a session file: the saved session asked for, or the one
 * the page shows, or else the live requests, which Studio builds as a save
 * would and keeps nowhere.
 *
 * @param target - The requests the file is made of
 * @returns The file with what it holds, to look over
 * @throws {StudioRequestError} When Studio refused to write it
 * @example
 * ```ts
 * const draft = await prepareSessionFile({ kind: "shown" });
 * ```
 */
export async function prepareSessionFile(target: SessionFileTarget): Promise<SessionFileDraft> {
  const { requests, shownSession } = useStudioStore.getState();
  const id = target.kind === "saved" ? target.id : shownSession?.id;
  const file = await post<unknown>(
    "/api/sessions/file",
    id === undefined ? { requests: requests.map(savedRequestOf) } : { id },
  );
  const draft = draftOf(file);
  if (!draft) throw new Error("Studio answered with something other than a session file");
  return draft;
}

/**
 * Save a session file as Studio wrote it, named after its session:
 * `checkout-fails.courier-session.json`.
 *
 * @param draft - The file looked over
 * @example
 * ```ts
 * downloadSessionFile(draft);
 * ```
 */
export function downloadSessionFile(draft: SessionFileDraft): void {
  downloadFile(JSON.stringify(draft.file, null, 2), sessionFileName(draft.name));
}

/**
 * The name a session file is saved under: its session's name, in lower
 * case, words joined by dashes — a session opened from a file shared on
 * under the name it came with.
 *
 * @param name - The session's name
 * @returns The file's name
 * @example
 * ```ts
 * sessionFileName("Checkout fails!"); // "checkout-fails.courier-session.json"
 * ```
 */
export function sessionFileName(name: string): string {
  const slug = name
    .replace(OPENED, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `${slug || "session"}.courier-session.json`;
}

function draftOf(file: unknown): SessionFileDraft | undefined {
  if (!isPlainObject(file) || file.format !== "courier-session") return undefined;
  const { session, redactions } = file;
  const environment = environmentOf(file.environment);
  if (!isPlainObject(session) || !Array.isArray(session.requests) || !environment) return undefined;
  const requests: unknown[] = session.requests;
  const places = Array.isArray(redactions) ? redactions.filter((p) => typeof p === "string") : [];
  return {
    file,
    name: String(session.name),
    calls: requests.length,
    requests: requests.filter(sentOwn).length,
    failed: requests.filter((r) => sentOwn(r) && isFailed(r)).length,
    environment,
    redactions: places.flatMap((place) => redactionOf(place, requests)),
  };
}

function redactionOf(place: string, requests: readonly unknown[]): Redaction[] {
  const [, index, field] = PLACE.exec(place) ?? [];
  if (index === undefined || field === undefined) return [];
  const request = requests[Number(index)];
  const endpoint = isPlainObject(request)
    ? [request.group, request.method].filter((part) => typeof part === "string" && part).join(".")
    : "";
  return [{ at: Number(index) + 1, endpoint, field }];
}

/* A call that sent a request of its own: a read another call's request answered carries the mark of it. */
function sentOwn(request: unknown): boolean {
  return isPlainObject(request) && request.shared === undefined;
}

function isFailed(request: unknown): boolean {
  if (!isPlainObject(request)) return false;
  const { status, statusCode } = request;
  return (
    status === "error" ||
    status === "validation_error" ||
    (typeof statusCode === "number" && statusCode >= 400)
  );
}

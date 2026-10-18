import { formatDuration } from "@/lib/formatters";
import type { RequestEntry, StreamConnection } from "@/store/types";
import { causeText } from "./payload-view";
import { type RequestState, requestStateOf, STATE_META } from "./request-state";

/** A live stream whose connection is not open: being opened, or being opened again. */
export type ConnectionTrouble = StreamConnection & { status: "connecting" | "reconnecting" };

/**
 * The connection of a live stream that is not open — being opened, or
 * being opened again after the last one ended — or `undefined` for one
 * that is open, has ended, or was told of by a runtime that does not say:
 * such a stream stands open.
 *
 * @param r - The stream
 * @returns Its connection, while it is not open
 * @example
 * ```ts
 * connectionTroubleOf(stream)?.status; // "reconnecting"
 * ```
 */
export function connectionTroubleOf(
  r: Pick<RequestEntry, "transport" | "streamStatus" | "status" | "streamConnection">,
): ConnectionTrouble | undefined {
  const connection = r.streamConnection;
  if (connection === undefined || connection.status === "open") return undefined;
  if (requestStateOf(r) !== "streaming") return undefined;
  return connection as ConnectionTrouble;
}

/**
 * How a request stands, in the words a screen reader is told and the
 * Timeline's search reads: a live stream whose connection is not open as
 * `Connecting` or `Reconnecting`, any other as its state's label.
 *
 * @param r - The request
 * @param state - Its state
 * @returns The words
 * @example
 * ```ts
 * stateLabelOf(reconnecting, "streaming"); // "Reconnecting"
 * ```
 */
export function stateLabelOf(
  r: Pick<RequestEntry, "transport" | "streamStatus" | "status" | "streamConnection">,
  state: RequestState,
): string {
  const trouble = state === "streaming" ? connectionTroubleOf(r) : undefined;
  return trouble ? troubleTitle(trouble) : STATE_META[state].label;
}

/**
 * How a live stream stands, in a word a list's narrow cell holds: `live`
 * while its connection is open, `···` while the first one is being opened
 * — as for a request in flight — and `retrying` while one is being opened
 * again.
 *
 * @param r - The live stream
 * @returns The word
 * @example
 * ```ts
 * liveWord(reconnecting); // "retrying"
 * ```
 */
export function liveWord(
  r: Pick<RequestEntry, "transport" | "streamStatus" | "status" | "streamConnection">,
): "live" | "···" | "retrying" {
  const status = connectionTroubleOf(r)?.status;
  return status === undefined ? "live" : status === "connecting" ? "···" : "retrying";
}

/**
 * Whether a stream has never had a connection open: its runtime said each
 * one it opened ended first. A stream a runtime that does not say so told
 * of opened, as far as Studio knows.
 *
 * @param r - The stream, live or ended
 * @returns Whether no connection of it ever opened
 * @example
 * ```ts
 * neverOpened(refusedForAMinute); // true
 * ```
 */
export function neverOpened(r: Pick<RequestEntry, "streamConnection">): boolean {
  const connection = r.streamConnection;
  return connection !== undefined && connection.status !== "open" && !connection.openedBefore;
}

/**
 * What a connection that is not open is doing, as a title says it.
 *
 * @param connection - The connection, while it is not open
 * @returns `Connecting` or `Reconnecting`
 */
export function troubleTitle(connection: ConnectionTrouble): "Connecting" | "Reconnecting" {
  return connection.status === "connecting" ? "Connecting" : "Reconnecting";
}

/**
 * Why a stream's last connection ended, in a line: the platform's code
 * and text — or, for a stream being opened for the first time, that no
 * answer has come yet.
 *
 * @param connection - The connection, while it is not open
 * @returns The line
 * @example
 * ```ts
 * troubleText(reconnecting); // "ECONNREFUSED · connect ECONNREFUSED 127.0.0.1:4010"
 * ```
 */
export function troubleText(connection: Pick<StreamConnection, "status" | "cause">): string {
  if (connection.status === "connecting") return "Waiting for the server to answer";
  return connection.cause ? causeText(connection.cause) : "The connection ended";
}

/**
 * How many connections in a row failed, and when the next one opens:
 * `3 failed attempts · next in 4s`. Nothing for a stream being opened
 * for the first time, or one whose open connection just dropped.
 *
 * @param connection - The connection, while it is not open
 * @param now - The time now
 * @returns The line, empty when there is nothing to tell
 * @example
 * ```ts
 * attemptsText({ status: "reconnecting", failures: 3, retryAt: 14_000, since: 1, openedBefore: false }, 10_000);
 * // "3 failed attempts · next in 4s"
 * ```
 */
export function attemptsText(connection: ConnectionTrouble, now: number): string {
  const { retryAt } = connection;
  const next = retryAt === undefined || retryAt <= now ? "" : `next in ${waitText(retryAt - now)}`;
  return [failuresText(connection), next].filter(Boolean).join(" · ");
}

/**
 * How many connections in a row failed: `3 failed attempts`; nothing for
 * one whose open connection just dropped.
 *
 * @param connection - The connection, while it is not open
 * @returns The count in words, empty for none
 */
export function failuresText(connection: ConnectionTrouble): string {
  const { failures = 0 } = connection;
  return failures === 0 ? "" : `${failures} failed attempt${failures === 1 ? "" : "s"}`;
}

/* A wait is told in whole seconds; under a second and past a minute, as any duration is. */
function waitText(ms: number): string {
  return ms < 1000 || ms >= 60_000 ? formatDuration(ms) : `${Math.ceil(ms / 1000)}s`;
}

/**
 * What the Messages tab says over a live stream whose connection is not
 * open: that it is being opened, and how long it has waited; or that it is
 * being opened again, why the last one ended, how many failed in a row and
 * when the next one opens.
 *
 * @param r - The stream
 * @param now - The time now
 * @returns The banner, or `null` while the connection is open or the stream has ended
 * @example
 * ```ts
 * connectionBanner(stream, now);
 * // → { title: "Reconnecting", detail: "ECONNREFUSED · connect ECONNREFUSED 127.0.0.1:4010 · 3 failed attempts · next in 4s" }
 * ```
 */
export function connectionBanner(
  r: RequestEntry,
  now: number,
): { title: string; detail: string } | null {
  const trouble = connectionTroubleOf(r);
  if (!trouble) return null;
  if (trouble.status === "connecting") {
    const waited = formatDuration(Math.max(0, now - trouble.since));
    return { title: troubleTitle(trouble), detail: `${troubleText(trouble)} · ${waited}` };
  }
  const detail = [troubleText(trouble), attemptsText(trouble, now)].filter(Boolean).join(" · ");
  return { title: troubleTitle(trouble), detail };
}

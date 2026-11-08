/**
 * What a page without the project's token is sent of each event Studio
 * sends a page, and answered to each event it sends: what a call carried as
 * an export carries it, every value Courier's rules for a name and a text
 * hide replaced, and nothing of an event not named here. The page outlet
 * sends it so; this is the list it reads.
 */

import { createHash } from "node:crypto";
import { cutSecrets, cutText } from "@noverax/courier/internal";

import { isPlainObject } from "./is-plain-object";
import {
  bodyWithoutSecrets,
  headersWithoutSecrets,
  scrubbedSession,
} from "./session-file/scrub-secrets";
import type { SavedSession } from "./session-types";
import { withoutCredentials } from "./storage/without-credentials";

/** What a page without the token is sent of an event it may not be sent at all. */
export const WITHHELD: unique symbol = Symbol("withheld");

type Shown = (payload: unknown) => unknown;

const same: Shown = (payload) => payload;

/* The events whose callers cut them for a page without the token, knowing what only they know:
   such a page is sent what they cut, and nothing when one is sent past them. */
export const CUT_BY_CALLER: ReadonlySet<string> = new Set(["config:status", "registry:updated"]);

/* Each other event Studio sends a page, and what of it a page without the token is sent. */
const WITHOUT_TOKEN: ReadonlyMap<string, Shown> = new Map<string, Shown>([
  /* What calls carried, as an export carries it. */
  ["events", (events) => (Array.isArray(events) ? events.map(eventWithoutSecrets) : WITHHELD)],
  ["events:replay", replayWithoutSecrets],
  ["mock:events:replay", replayWithoutSecrets],
  ["view:session", (session) => scrubbedSession(session as SavedSession)],
  ["playground:history", (entries) => bodyWithoutSecrets(entries)],
  ["page:state", pageStateWithoutSecrets],
  ["page:state:changed", changedPageStateWithoutSecrets],
  /* The page's own call from the Playground, as it was answered. */
  ["playground:chunk", same],
  ["playground:end", same],
  ["playground:error", same],
  /* What carries no value a call carried. */
  ["studio:info", same],
  ["studio:read-only", same],
  ["binding:snapshot", same],
  ["binding:error", same],
  ["runtime:duplicate", same],
  ["storage:size", same],
  ["storage:cleared", same],
  ["mocks:status", same],
  ["watcher:status", same],
  ["watcher:change", same],
  ["scan:sources", same],
  ["requests:pinned", same],
  ["requests:pinned:changed", same],
]);

/* The page state left unfinished in the API import: an address on its way to being typed whole. */
const IMPORT = "apis.import";

/**
 * What a page without the token is sent of an event: its payload as an
 * export carries it, the payload itself where it carries nothing a call
 * carried, or {@link WITHHELD} for an event it may not be sent — one this
 * module does not name, or one a caller cuts and sent past it.
 *
 * @param event - The event's name
 * @param payload - Its payload, whole
 * @returns What the page is sent, or {@link WITHHELD}
 * @example
 * ```ts
 * shownToPageWithoutToken("view:session", session); // the session as an export carries it
 * ```
 */
export function shownToPageWithoutToken(event: string, payload: unknown): unknown {
  if (CUT_BY_CALLER.has(event)) return WITHHELD;
  const shown = WITHOUT_TOKEN.get(event);
  return shown === undefined ? WITHHELD : shown(payload);
}

/**
 * What a page without the token is answered to an event it sent: a
 * request's whole body as an export carries it — JSON read and cut by the
 * rules for a name and a text, any other text by those for a text — and any
 * other answer, a mock's records among them, by the rules for a name and a
 * text.
 *
 * @param event - The event the page sent
 * @param reply - The answer, whole
 * @returns The answer the page is sent
 * @example
 * ```ts
 * ack(answeredWithoutToken("request:body", reply));
 * ```
 */
export function answeredWithoutToken(event: string, reply: unknown): unknown {
  if (event !== "request:body" && event !== "mock:body") return bodyWithoutSecrets(reply);
  if (!isPlainObject(reply) || reply.ok !== true || typeof reply.data !== "string") return reply;
  return { ...reply, data: bodyTextWithoutSecrets(reply.data) };
}

/* An event as a page without the token is sent it: credentials cut as Studio writes them down, and
   the variables, the answer, the headers and a stream message's preview as an export carries them. */
function eventWithoutSecrets(event: unknown): unknown {
  const kept = withoutCredentials(event);
  if (!isPlainObject(kept)) return kept;
  return {
    ...kept,
    ...(kept.variables !== undefined && { variables: bodyWithoutSecrets(kept.variables) }),
    ...(kept.data !== undefined && { data: bodyWithoutSecrets(kept.data) }),
    ...(typeof kept.dataPreview === "string" && { dataPreview: cutText(kept.dataPreview) }),
    ...headerFieldsWithoutSecrets(kept),
  };
}

/* The fields of an event that hold headers, each value its name keeps read as a text. */
function headerFieldsWithoutSecrets(event: Record<string, unknown>): Record<string, unknown> {
  const cut: Record<string, unknown> = {};
  for (const field of ["headers", "requestHeaders", "responseHeaders"]) {
    const headers = event[field];
    if (isPlainObject(headers)) {
      cut[field] = headersWithoutSecrets(headers as Record<string, string>);
    }
  }
  return cut;
}

/* A replay is the JSON array its database's rows make, as bytes: read, each event cut, written
   again. A page that reconnects while nothing new was logged is sent the one cut before, found by
   the replay's hash — the requests' and the mocks' replays each. */
const replays = new Map<string, Uint8Array>();
const KEPT_REPLAYS = 2;

function replayWithoutSecrets(payload: unknown): unknown {
  if (!(payload instanceof Uint8Array)) return WITHHELD;
  const key = createHash("sha256").update(payload).digest("hex");
  const kept = replays.get(key);
  if (kept) return kept;
  let events: unknown;
  try {
    events = JSON.parse(
      Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength).toString("utf8"),
    );
  } catch {
    return WITHHELD;
  }
  if (!Array.isArray(events)) return WITHHELD;
  const shown = Buffer.from(JSON.stringify(events.map(eventWithoutSecrets)), "utf8");
  const oldest = replays.keys().next().value;
  if (replays.size >= KEPT_REPLAYS && oldest !== undefined) replays.delete(oldest);
  replays.set(key, shown);
  return shown;
}

/* What the pages keep — settings, drafts — sent to a page without the token: no import left
   unfinished, and the rest as an export carries a body. */
function pageStateWithoutSecrets(payload: unknown): unknown {
  if (!isPlainObject(payload) || !isPlainObject(payload.state)) return WITHHELD;
  const { [IMPORT]: _unfinished, ...state } = payload.state;
  return unlessCut(payload, { ...payload, state: bodyWithoutSecrets(state) });
}

function changedPageStateWithoutSecrets(payload: unknown): unknown {
  if (!isPlainObject(payload) || payload.key === IMPORT) return WITHHELD;
  return unlessCut(payload, { ...payload, value: bodyWithoutSecrets(payload.value) });
}

/* What the pages keep is small: where nothing of it was cut, the page is sent it as it was, with the
   pages that have the token in one message. */
function unlessCut(whole: unknown, shown: unknown): unknown {
  return JSON.stringify(shown) === JSON.stringify(whole) ? whole : shown;
}

/* A body as its app sent it, as text: JSON read and cut, and written back only where something was
   cut, so a body with nothing to cut is sent as it was written; any other text cut as a text is. */
function bodyTextWithoutSecrets(text: string): string {
  let read: unknown;
  try {
    read = JSON.parse(text);
  } catch {
    return cutSecrets(text);
  }
  const shown = JSON.stringify(bodyWithoutSecrets(read));
  return shown === JSON.stringify(read) ? text : shown;
}

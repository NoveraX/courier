import { searchWholeLines, searchWholeTree, type WholeSearchResult } from "./whole-search";

/** A search over a whole body, as the page asks it: which body, its text the first time, what to seek, in which view. */
export interface WholeSearchAsk {
  id: number;
  /** Names the body, so its text is sent once and parsed once. */
  key: string;
  /** The whole body as JSON: sent with the first search over it. */
  text?: string | undefined;
  query: string;
  mode: "tree" | "raw";
}

/** That no view shows a body any longer: what holds it lets it go. */
export interface WholeForget {
  forget: string;
}

/** The answer: what was found, that the body named is no longer held, or why the search failed. */
export type WholeSearchReply =
  | { id: number; ok: true; result: WholeSearchResult | undefined }
  | { id: number; ok: false; missing: true }
  | { id: number; ok: false; error: string };

/**
 * Whether a message is a search the page asked.
 *
 * @param value - The message
 * @returns Whether it is one
 * @example
 * ```ts
 * isWholeSearchAsk({ id: 1, key: "s:r1:response", query: "kaz", mode: "tree" }); // true
 * ```
 */
export function isWholeSearchAsk(value: unknown): value is WholeSearchAsk {
  if (typeof value !== "object" || value === null) return false;
  const text: unknown = Reflect.get(value, "text");
  const mode: unknown = Reflect.get(value, "mode");
  return (
    typeof Reflect.get(value, "id") === "number" &&
    typeof Reflect.get(value, "key") === "string" &&
    typeof Reflect.get(value, "query") === "string" &&
    (mode === "tree" || mode === "raw") &&
    (text === undefined || typeof text === "string")
  );
}

/**
 * Whether a message tells what holds a body to let it go.
 *
 * @param value - The message
 * @returns Whether it is one
 * @example
 * ```ts
 * isWholeForget({ forget: "s:r1:response" }); // true
 * ```
 */
export function isWholeForget(value: unknown): value is WholeForget {
  return (
    typeof value === "object" && value !== null && typeof Reflect.get(value, "forget") === "string"
  );
}

/**
 * Whether a message is an answer to a search.
 *
 * @param value - The message
 * @returns Whether it is one
 * @example
 * ```ts
 * isWholeSearchReply({ id: 1, ok: false, missing: true }); // true
 * ```
 */
export function isWholeSearchReply(value: unknown): value is WholeSearchReply {
  if (typeof value !== "object" || value === null) return false;
  return (
    typeof Reflect.get(value, "id") === "number" && typeof Reflect.get(value, "ok") === "boolean"
  );
}

/** What answers searches over one whole body at a time, and lets it go. */
export interface WholeHolder {
  answer(ask: WholeSearchAsk): WholeSearchReply;
  /** Let the body go, when it is the one held: no view shows it any longer. */
  forget(key: string): void;
}

/**
 * What answers searches over one whole body at a time: it parses a body
 * the first time its text comes, keeps it under its key, prints its raw
 * lines the first time the raw view searches it, and answers that a body
 * it no longer holds is missing, so the page sends its text again. Told
 * that no view shows the body, it lets it go: parsed, a body of tens of
 * megabytes takes several times that.
 *
 * @returns What answers searches, and lets a body go
 * @example
 * ```ts
 * const holder = createWholeHolder();
 * holder.answer({ id: 1, key: "s:r1:response", text: '{"city":"Kazan"}', query: "kaz", mode: "tree" });
 * holder.forget("s:r1:response");
 * ```
 */
export function createWholeHolder(): WholeHolder {
  let held: { key: string; value: unknown; lines?: string[] } | undefined;
  return {
    answer(ask) {
      try {
        if (ask.text !== undefined) held = { key: ask.key, value: JSON.parse(ask.text) };
        if (held?.key !== ask.key) return { id: ask.id, ok: false, missing: true };
        if (ask.mode === "tree") {
          return { id: ask.id, ok: true, result: searchWholeTree(held.value, ask.query) };
        }
        held.lines ??= JSON.stringify(held.value, null, 2).split("\n");
        return { id: ask.id, ok: true, result: searchWholeLines(held.lines, ask.query) };
      } catch (error) {
        /* The body did not parse, or the search ran out of room: the page says why. */
        return {
          id: ask.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    forget(key) {
      if (held?.key === key) held = undefined;
    },
  };
}

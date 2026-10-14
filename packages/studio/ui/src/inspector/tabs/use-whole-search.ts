import { useEffect, useRef, useState } from "react";

import type { WholeSearchResult } from "@/features/requests/whole-search";
import { askWholeSearch, forgetWholeBody } from "@/features/requests/whole-search-client";
import type { BodyAnswer } from "@/socket/ask-for-body";

/** Where the whole of a payload shown in part comes from. */
export interface WholeSource {
  /** Names the body: a search holds it while the same key shows. */
  key: string;
  /** Asks the app or the mock, which keep the whole bodies of their latest requests, for it as JSON. */
  load: () => Promise<BodyAnswer>;
}

/** Where a search over the whole body stands. */
export type WholeSearchState =
  | { status: "off" }
  | { status: "searching"; previous?: WholeSearchResult | undefined }
  | { status: "found"; result: WholeSearchResult }
  | { status: "failed"; reason: string };

/* A search waits for typing to pause, so each key pressed does not search a large body again. */
const PAUSE_MS = 150;

interface Held {
  key: string;
  body: Promise<BodyAnswer>;
  sent: boolean;
  /** Whether the body could not be had: the next search asks for it again, as it may be had then. */
  failed: boolean;
}

async function searchHeld(
  held: Held,
  query: string,
  mode: "tree" | "raw",
  signal: AbortSignal,
): Promise<WholeSearchState> {
  const answer = await held.body;
  if (!answer.ok) {
    held.failed = true;
    return { status: "failed", reason: answer.error };
  }
  const first = !held.sent;
  held.sent = true;
  const ask = { key: held.key, query, mode };
  let reply = await askWholeSearch(first ? { ...ask, text: answer.data } : ask, signal);
  if (!reply.ok && "missing" in reply) {
    reply = await askWholeSearch({ ...ask, text: answer.data }, signal);
  }
  if (!reply.ok) return { status: "failed", reason: "error" in reply ? reply.error : "" };
  return reply.result ? { status: "found", result: reply.result } : { status: "off" };
}

/* A search that failed on the way, not in its answer, says why all the same: the view
   goes back to the part shown rather than waiting on a search that will not answer. */
async function searchSafely(
  held: Held,
  query: string,
  mode: "tree" | "raw",
  signal: AbortSignal,
): Promise<WholeSearchState> {
  try {
    return await searchHeld(held, query, mode, signal);
  } catch (error) {
    console.warn("[courier-studio] The whole body could not be searched", error);
    return { status: "failed", reason: error instanceof Error ? error.message : String(error) };
  }
}

/* Parsed, a body of tens of megabytes takes several times that: once the view moves on from it,
   what searched it lets it go, and so does the view. */
function useLetGo(key: string | undefined, held: React.RefObject<Held | undefined>): void {
  useEffect(() => {
    if (key === undefined) return;
    return () => {
      forgetWholeBody(key);
      if (held.current?.key === key) held.current = undefined;
    };
  }, [key, held]);
}

/**
 * What a view shows of a search over the whole body: what it found, or,
 * while the next search runs, what the last one found.
 *
 * @param state - Where the search stands
 * @returns The result to show, or nothing
 * @example
 * ```ts
 * shownResult({ status: "searching", previous: result }); // result
 * ```
 */
export function shownResult(state: WholeSearchState): WholeSearchResult | undefined {
  if (state.status === "found") return state.result;
  return state.status === "searching" ? state.previous : undefined;
}

/**
 * Search the whole of a payload the view shows in part: the whole body is
 * asked for once per key, the first time a search runs over it — again
 * after it could not be had — and each search runs once typing pauses, in
 * a worker away from the page. A search overtaken by the next one is
 * skipped, or its answer dropped, and once the view moves on from a body,
 * it is let go.
 *
 * @param source - Where the whole comes from, when the view shows a part of it
 * @param query - The text sought; blank searches nothing
 * @param mode - Which view the search is for
 * @returns Where the search stands
 * @example
 * ```ts
 * const whole = useWholeSearch({ key, load }, query, "tree");
 * if (whole.status === "found") show(whole.result.rows);
 * ```
 */
export function useWholeSearch(
  source: WholeSource | undefined,
  query: string,
  mode: "tree" | "raw",
): WholeSearchState {
  const [state, setState] = useState<WholeSearchState>({ status: "off" });
  const held = useRef<Held | undefined>(undefined);
  const lastMode = useRef(mode);
  const load = useRef(source?.load);
  load.current = source?.load;
  const key = source?.key;
  useEffect(() => {
    const ask = load.current;
    if (key === undefined || ask === undefined || query.trim() === "") {
      setState({ status: "off" });
      return;
    }
    const moved = new AbortController();
    /* What the last search over this body, in this view, found stays in view until this one
       answers, so typing does not flicker; another body's or view's never does. */
    const same = held.current?.key === key && lastMode.current === mode;
    lastMode.current = mode;
    setState((current) => ({
      status: "searching",
      previous: same ? shownResult(current) : undefined,
    }));
    const timer = setTimeout(() => {
      if (held.current?.key !== key || held.current.failed) {
        held.current = { key, body: ask(), sent: false, failed: false };
      }
      void searchSafely(held.current, query, mode, moved.signal).then((next) => {
        if (!moved.signal.aborted) setState(next);
      });
    }, PAUSE_MS);
    return () => {
      moved.abort();
      clearTimeout(timer);
    };
  }, [key, query, mode]);
  useLetGo(key, held);
  return state;
}

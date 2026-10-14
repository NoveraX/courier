import {
  createWholeHolder,
  isWholeSearchReply,
  type WholeForget,
  type WholeHolder,
  type WholeSearchAsk,
  type WholeSearchReply,
} from "./whole-search-holder";

/** A search sent to the worker in its turn. */
interface Queued {
  asked: WholeSearchAsk;
  /** Aborted once the view that asked has moved on. */
  signal: AbortSignal | undefined;
  resolve: (reply: WholeSearchReply) => void;
}

let worker: Worker | undefined;
/* Where no worker runs — a test, or a page that refused to start one —
   the page answers itself. */
let onPage: WholeHolder | undefined;
let workerFailed = false;
let lastId = 0;
let sent: Queued | undefined;
const queue: Queued[] = [];

const overtaken = (id: number): WholeSearchReply => ({
  id,
  ok: false,
  error: "A newer search overtook it.",
});

/* One search at a time, so one whose view has moved on is skipped rather than run: a
   search over a body of tens of megabytes takes a good part of a second. A body that
   went unsent with it is missing for the next search, which sends it again. */
function sendNext(): void {
  if (sent !== undefined || worker === undefined) return;
  let next = queue.shift();
  while (next?.signal?.aborted) {
    next.resolve(overtaken(next.asked.id));
    next = queue.shift();
  }
  if (next === undefined) return;
  sent = next;
  worker.postMessage(next.asked);
}

/* From now on the page searches itself. What waited on the worker is told
   its body is missing, so the page sends it again — to the page, this time. */
function fallBack(what: string, detail: unknown): void {
  console.warn(`[courier-studio] The search worker ${what}; the page searches itself`, detail);
  workerFailed = true;
  worker?.terminate();
  worker = undefined;
  const waited = sent === undefined ? queue : [sent, ...queue];
  for (const { asked, resolve } of waited) resolve({ id: asked.id, ok: false, missing: true });
  sent = undefined;
  queue.length = 0;
}

function started(): Worker | undefined {
  if (worker || workerFailed || typeof Worker === "undefined") return worker;
  try {
    worker = new Worker(new URL("./whole-search-worker.ts", import.meta.url), { type: "module" });
  } catch (error) {
    /* A page that may not start workers refuses at once, rather than by an error event. */
    fallBack("could not start", error);
    return undefined;
  }
  worker.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (!isWholeSearchReply(event.data) || sent?.asked.id !== event.data.id) return;
    sent.resolve(event.data);
    sent = undefined;
    sendNext();
  });
  worker.addEventListener("error", (event) => fallBack("stopped", event));
  return worker;
}

/**
 * Search a whole body away from the page, in a worker of its own, which
 * holds the body it was last sent: its text goes with the first search
 * over it. Searches go one at a time, and one whose view has moved on by
 * its turn is skipped. Where no worker runs, the page searches it itself.
 *
 * @param ask - Which body, its text the first time, what to seek, in which view
 * @param signal - Aborted once the view that asks has moved on
 * @returns The answer
 * @example
 * ```ts
 * const reply = await askWholeSearch({ key: "s:r1:response", text, query: "kaz", mode: "tree" }, signal);
 * if (reply.ok) show(reply.result);
 * ```
 */
export function askWholeSearch(
  ask: Omit<WholeSearchAsk, "id">,
  signal?: AbortSignal,
): Promise<WholeSearchReply> {
  lastId += 1;
  const asked = { ...ask, id: lastId };
  if (signal?.aborted) return Promise.resolve(overtaken(asked.id));
  if (!started()) {
    onPage ??= createWholeHolder();
    return Promise.resolve(onPage.answer(asked));
  }
  return new Promise((resolve) => {
    queue.push({ asked, signal, resolve });
    sendNext();
  });
}

/**
 * Let a whole body go that no view shows any longer: the worker, or the
 * page, holds it parsed, which for a body of tens of megabytes takes
 * several times that. A search over it after sends it again.
 *
 * @param key - The body's key
 * @example
 * ```ts
 * forgetWholeBody("request:s1:r1:response");
 * ```
 */
export function forgetWholeBody(key: string): void {
  worker?.postMessage({ forget: key } satisfies WholeForget);
  onPage?.forget(key);
}

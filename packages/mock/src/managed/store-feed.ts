import { performance } from "node:perf_hooks";

import type { MockStore } from "../store";
import {
  type CollectionReport,
  type ReportedCollection,
  remember,
  reportCollection,
} from "./collection-report";
import { send, sendError } from "./worker-ipc";

/* The changes of a burst of requests travel together: a report follows the
   first of them by this long at least... */
const MIN_DELAY_MS = 100;
/* ...and by this many times as long as working out the last report took, so
   a large store never gives its reports more than a sixth of the worker's time. */
const DELAY_PER_COST = 5;

/** Reports of a mock's store to Studio. */
export interface StoreFeed {
  /** The store as it is, whole: what the reports that follow are reports of changes to. */
  start(): Array<{ name: string; count: number; records: object[] }>;
  /** Report the store's changes soon, with the ones that come meanwhile. */
  changed(): void;
  /** Report the store's changes now. */
  flush(): void;
  /** Report every collection whole, for a holder of the store that lost track of it. */
  resend(): void;
  /** Report what changed since the last report, and stop. */
  close(): void;
}

/**
 * Report the changes of a mock's store to Studio as `mock:store:changes`
 * events, numbered from the store the mock started with: each collection
 * that changed, as the edits to it or whole, and each one gone. A store of
 * tens of thousands of records sends, for a request that adds one, that
 * one record.
 *
 * @param store - The mock's store
 * @returns The feed
 * @example
 * ```ts
 * const feed = createStoreFeed(server.store);
 * send({ type: "ready", collections: feed.start(), ... });
 * server.requestHooks.onEnd = () => feed.changed();
 * ```
 */
export function createStoreFeed(store: MockStore): StoreFeed {
  let reported = new Map<string, ReportedCollection>();
  let seq = 0;
  let cost = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failure: string | undefined;

  /* The store as it is now, and what changed in it since the last report. */
  function survey(whole: boolean) {
    const now = new Map<string, ReportedCollection>();
    for (const name of store.list()) now.set(name, remember(store.collection(name).getAll()));
    const collections: CollectionReport[] = [];
    for (const [name, after] of now) {
      const entry = reportCollection(name, whole ? undefined : reported.get(name), after);
      if (entry !== null) collections.push(entry);
    }
    const removed = whole ? [] : [...reported.keys()].filter((name) => !now.has(name));
    return { now, collections, removed };
  }

  function report(whole: boolean): void {
    clearTimeout(timer);
    timer = undefined;
    const started = performance.now();
    try {
      const { now, collections, removed } = survey(whole);
      if (whole || collections.length + removed.length > 0) {
        const event = { type: "mock:store:changes", seq: seq + 1, whole, collections, removed };
        send({ type: "event", event });
        seq += 1;
      }
      reported = now;
      failure = undefined;
    } catch (error) {
      warn(error);
    }
    cost = performance.now() - started;
  }

  /* A record that is no JSON fails every report until it changes: Studio is told once. */
  function warn(error: unknown): void {
    const message = `The store's changes could not be sent to Studio: ${error instanceof Error ? error.message : String(error)}`;
    if (message !== failure) sendError(message, false);
    failure = message;
  }

  return {
    start() {
      reported = new Map();
      seq = 0;
      return store.list().map((name) => {
        const records = store.collection(name).getAll();
        reported.set(name, remember(records));
        return { name, count: records.length, records };
      });
    },
    changed() {
      if (timer !== undefined) return;
      timer = setTimeout(() => report(false), Math.max(MIN_DELAY_MS, cost * DELAY_PER_COST));
      timer.unref();
    },
    flush: () => report(false),
    resend: () => report(true),
    close() {
      if (timer !== undefined) report(false);
    },
  };
}

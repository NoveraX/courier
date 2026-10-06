/**
 * How much a public demo takes from its visitors, counted in windows of ten
 * seconds for each page, for each address and for every visitor together,
 * so one visitor cannot crowd out the rest: not by opening more pages, and
 * not alone.
 */

/** What a visitor does that the demo counts. */
export type DemoAction = "send" | "command" | "lifecycle" | "rest" | "body" | "http";

/** How long a count lasts. */
export const DEMO_WINDOW_MS = 10_000;

/** How many of an action one page, one address and every visitor together may take in a window. */
export interface DemoLimit {
  /** For one page; none for what no page sends, a request over HTTP. */
  page?: number | undefined;
  address: number;
  all: number;
}

/**
 * How many of each a visitor may do in a window. An address takes more
 * than a page, since several people may share one; never so much that a
 * single address uses every visitor's share.
 */
export const DEMO_LIMITS: Readonly<Record<DemoAction, DemoLimit>> = {
  send: { page: 10, address: 20, all: 60 },
  command: { page: 20, address: 30, all: 60 },
  lifecycle: { page: 5, address: 10, all: 20 },
  rest: { address: 20, all: 60 },
  body: { page: 10, address: 15, all: 30 },
  http: { address: 600, all: 6000 },
};

const NAMES: Readonly<Record<DemoAction, string>> = {
  send: "Playground calls",
  command: "mock commands",
  lifecycle: "mock starts and stops",
  rest: "requests to Studio's API",
  body: "whole bodies",
  http: "requests",
};

const ACTIONS = Object.keys(DEMO_LIMITS).filter(isAction);

/* Counts kept before those whose window has passed are let go. */
const PRUNE_FROM = 10_000;

/** Who did something: the page, when a page sent it, and the address it came from. */
export interface DemoVisitor {
  page?: string | undefined;
  address: string;
}

interface Count {
  opened: number;
  taken: number;
}

/** The counts of a demo's visitors. */
export interface DemoLimits {
  /**
   * Count an action, unless it is one too many for the page, the address or
   * every visitor together.
   *
   * @param visitor - The page that sent it, and the address it came from
   * @param action - What it does
   * @param now - The time, in epoch milliseconds
   * @returns Why it is refused, or `null` once it is counted
   */
  take(visitor: DemoVisitor, action: DemoAction, now?: number): string | null;
  /** Forget the counts of a page that left. */
  forget(pageId: string): void;
}

/**
 * The counts of a demo's visitors, each starting afresh once its window
 * has passed.
 *
 * @returns Empty counts
 * @example
 * ```ts
 * const limits = createDemoLimits();
 * const refusal = limits.take({ page: socket.id, address }, "send");
 * if (refusal) refuse(refusal);
 * ```
 */
export function createDemoLimits(): DemoLimits {
  const counts = new Map<string, Count>();
  const countOf = (key: string, now: number): Count => {
    const count = counts.get(key);
    if (count && now - count.opened < DEMO_WINDOW_MS) return count;
    if (counts.size >= PRUNE_FROM) prune(counts, now);
    const fresh = { opened: now, taken: 0 };
    counts.set(key, fresh);
    return fresh;
  };
  return {
    take({ page, address }, action, now = Date.now()) {
      const limit = DEMO_LIMITS[action];
      const mine = page === undefined ? undefined : countOf(`${action} page ${page}`, now);
      const theirs = countOf(`${action} address ${address}`, now);
      const everyone = countOf(`${action} all`, now);
      if (mine && limit.page !== undefined && mine.taken >= limit.page) {
        return tooMany(action, limit.page, "one page");
      }
      if (theirs.taken >= limit.address) return tooMany(action, limit.address, "one address");
      if (everyone.taken >= limit.all) return tooMany(action, limit.all, "all its visitors");
      for (const count of [mine, theirs, everyone]) if (count) count.taken++;
      return null;
    },
    forget(pageId) {
      for (const action of ACTIONS) counts.delete(`${action} page ${pageId}`);
    },
  };
}

/* An address seen once stays no longer than its window, however many come. */
function prune(counts: Map<string, Count>, now: number): void {
  for (const [key, count] of counts) {
    if (now - count.opened >= DEMO_WINDOW_MS) counts.delete(key);
  }
}

function tooMany(action: DemoAction, limit: number, from: string): string {
  const seconds = DEMO_WINDOW_MS / 1000;
  return `The demo takes up to ${limit} ${NAMES[action]} every ${seconds} s from ${from}. Try again in a moment.`;
}

function isAction(key: string): key is DemoAction {
  return Object.hasOwn(DEMO_LIMITS, key);
}

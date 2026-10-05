/**
 * How much a public demo takes from its visitors, counted in windows of ten
 * seconds for each page and for every page together, so one visitor cannot
 * crowd out the rest.
 */

/** What a visitor does that the demo counts. */
export type DemoAction = "send" | "command" | "lifecycle" | "rest" | "body";

/** How long a count lasts. */
export const DEMO_WINDOW_MS = 10_000;

/**
 * How many of each one page may do in a window, and every page together.
 * A request to Studio's API names no page, so all visitors share its count.
 */
export const DEMO_LIMITS: Readonly<Record<DemoAction, { page: number; all: number }>> = {
  send: { page: 10, all: 60 },
  command: { page: 20, all: 60 },
  lifecycle: { page: 5, all: 20 },
  rest: { page: 60, all: 60 },
  body: { page: 10, all: 30 },
};

const NAMES: Readonly<Record<DemoAction, string>> = {
  send: "Playground calls",
  command: "mock commands",
  lifecycle: "mock starts and stops",
  rest: "requests to Studio's API",
  body: "whole bodies",
};

const ACTIONS = Object.keys(DEMO_LIMITS).filter(isAction);

/** Every page together, as the key of a count. */
const ALL = "*";

interface Count {
  opened: number;
  taken: number;
}

/** The counts of a demo's visitors. */
export interface DemoLimits {
  /**
   * Count an action, unless it is one too many for the page or for every
   * page together.
   *
   * @param pageId - The page's socket id, or `"*"` for an action no page is known for
   * @param action - What it does
   * @param now - The time, in epoch milliseconds
   * @returns Why it is refused, or `null` once it is counted
   */
  take(pageId: string, action: DemoAction, now?: number): string | null;
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
 * const refusal = limits.take(socket.id, "send");
 * if (refusal) refuse(refusal);
 * ```
 */
export function createDemoLimits(): DemoLimits {
  const counts = new Map<string, Count>();
  const countOf = (key: string, now: number): Count => {
    const count = counts.get(key);
    if (count && now - count.opened < DEMO_WINDOW_MS) return count;
    const fresh = { opened: now, taken: 0 };
    counts.set(key, fresh);
    return fresh;
  };
  return {
    take(pageId, action, now = Date.now()) {
      const limit = DEMO_LIMITS[action];
      const mine = countOf(`${action} ${pageId}`, now);
      const everyone = countOf(`${action} ${ALL}`, now);
      if (pageId !== ALL && mine.taken >= limit.page)
        return tooMany(action, limit.page, "one page");
      if (everyone.taken >= limit.all) return tooMany(action, limit.all, "all its visitors");
      mine.taken++;
      if (mine !== everyone) everyone.taken++;
      return null;
    },
    forget(pageId) {
      if (pageId === ALL) return;
      for (const action of ACTIONS) counts.delete(`${action} ${pageId}`);
    },
  };
}

function tooMany(action: DemoAction, limit: number, from: string): string {
  const seconds = DEMO_WINDOW_MS / 1000;
  return `The demo takes up to ${limit} ${NAMES[action]} every ${seconds} s from ${from}. Try again in a moment.`;
}

function isAction(key: string): key is DemoAction {
  return Object.hasOwn(DEMO_LIMITS, key);
}

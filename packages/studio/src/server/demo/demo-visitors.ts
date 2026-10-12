/**
 * What a visitor of a public demo may send from a page without the token.
 */

import type { VisitorDecision, VisitorPage, VisitorPolicy } from "../ui-token-guard";
import { WRITING_EVENTS } from "../ui-token-guard";
import { demoCommandProblem, type RecordsIn } from "./demo-command-bounds";
import { createDemoLimits, type DemoLimits } from "./demo-limits";
import { DEMO_SHARED_REFUSAL } from "./demo-refusals";

/** The most a Playground call or a message to a channel may weigh, as JSON. */
export const DEMO_MAX_PAYLOAD = 64 * 1024;

/** The most a mock command may weigh, as JSON: a record a visitor adds, say. */
export const DEMO_MAX_COMMAND = 8 * 1024;

/** How many Playground calls one page may keep open — streams and channels stay open — and every page together. */
export const DEMO_OPEN_CALLS = { page: 4, all: 40 } as const;

/**
 * The largest message a socket may send a demo. Socket.IO reads a message
 * whole before any rule sees it, so each visitor's socket may hold this
 * much at once: a crowd of them sending the largest a developer's Studio
 * takes held gigabytes, and a visitor sends no more than
 * {@link DEMO_MAX_PAYLOAD}. The project's own runtimes are told it as they
 * say hello, and send a Playground answer or a whole body larger than it as
 * a refusal saying so; their events, bodies cut and stream messages
 * previewed, stay far below it.
 */
export const DEMO_MAX_MESSAGE_BYTES = 512 * 1024;

const RUN: VisitorDecision = { kind: "run" };
const DROP: VisitorDecision = { kind: "drop" };

/** What the demo's rule reads of the running Studio. */
export interface DemoVisitorsDeps {
  /** How many Playground calls are in flight: the ones a page sent, or every page's. */
  callsInFlight: (pageId?: string) => number;
  /** The visitors' counts, fresh unless given. */
  limits?: DemoLimits | undefined;
  /** How many records a mock's collection holds, for the demo's bound on them. */
  recordsIn?: RecordsIn | undefined;
}

/**
 * A public demo's rule for a page without the token. Besides reading, it
 * may send from the Playground and drive the mocks — start, stop and
 * restart them, set their latency and failures, apply scenarios, change
 * their data — each within the demo's limits and bounds (see
 * {@link createDemoLimits} and {@link demoCommandProblem}). It keeps its
 * Playground history to itself, as its page does; clearing or switching
 * what every page shows is refused.
 *
 * @param deps - The Playground calls in flight, and the counts to keep
 * @returns The rule `guardUiWrites` holds the page to
 * @example
 * ```ts
 * const visitors = demoVisitors({ callsInFlight: router.callsInFlight });
 * guardUiWrites(socket, token, visitors);
 * ```
 */
export function demoVisitors({
  callsInFlight,
  limits = createDemoLimits(),
  recordsIn,
}: DemoVisitorsDeps): VisitorPolicy {
  const openProblem = (pageId: string): string | null => {
    const { page, all } = DEMO_OPEN_CALLS;
    if (callsInFlight(pageId) >= page) {
      return `The demo keeps up to ${page} Playground calls open for one page. Stop one to start another.`;
    }
    return callsInFlight() >= all
      ? `The demo's visitors have ${all} Playground calls open, as many as it keeps. Try again in a moment.`
      : null;
  };
  /* Each check runs only when the ones before it pass, so a refused event is not counted. */
  const decide = (
    visitor: VisitorPage,
    event: string,
    args: readonly unknown[],
  ): VisitorDecision => {
    switch (event) {
      case "playground:history:save":
        return DROP;
      case "playground:exec:cancel":
        return RUN;
      case "playground:exec":
        return verdict(
          sizeProblem(args, DEMO_MAX_PAYLOAD) ??
            openProblem(visitor.page) ??
            limits.take(visitor, "send"),
        );
      case "playground:write":
        return verdict(sizeProblem(args, DEMO_MAX_PAYLOAD) ?? limits.take(visitor, "send"));
      case "mock:command":
        return verdict(
          sizeProblem(args, DEMO_MAX_COMMAND) ??
            demoCommandProblem(args[0], recordsIn) ??
            limits.take(visitor, "command"),
        );
      case "mock:managed":
        return verdict(limits.take(visitor, "lifecycle"));
      case "mock:body":
      case "request:body":
        return verdict(limits.take(visitor, "body"));
      case "mock:store:get":
        return verdict(limits.take(visitor, "store"));
      default:
        return WRITING_EVENTS.has(event) ? { kind: "refuse", reason: DEMO_SHARED_REFUSAL } : RUN;
    }
  };
  return { decide, forget: (pageId) => limits.forget(pageId) };
}

function verdict(problem: string | null): VisitorDecision {
  return problem === null ? RUN : { kind: "refuse", reason: problem };
}

/* What the page sent, its acknowledgement aside, weighed as JSON. A payload
   JSON cannot write — nested past the stack, say — is no smaller. */
function sizeProblem(args: readonly unknown[], max: number): string | null {
  const sent = typeof args.at(-1) === "function" ? args.slice(0, -1) : args;
  let size: number;
  try {
    size = JSON.stringify(sent).length;
  } catch {
    size = Number.POSITIVE_INFINITY;
  }
  return size > max ? `The demo takes up to ${max / 1024} KB at a time from a visitor.` : null;
}

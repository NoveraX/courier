/**
 * Problems found while starting up, kept until the banner can show them.
 *
 * Studio prints its banner by resetting the terminal and clearing the
 * scrollback, so anything reported before that moment is not merely scrolled
 * away — it cannot be recovered. A config that failed to load is exactly the
 * kind of thing that gets erased and then looks like a clean start, with no
 * bindings, no watcher, and no visible reason.
 */

import { messageOf } from "./message-of";

const issues: string[] = [];

/** Report something the user needs to see once the banner is up. */
export function recordStartupIssue(summary: string, detail?: unknown): void {
  const reason = detail ? messageOf(detail) : "";
  issues.push(reason ? `${summary}: ${reason}` : summary);
}

/** Everything reported so far. */
export function startupIssues(): readonly string[] {
  return issues;
}

/** Forget them — for tests, and for a restart within one process. */
export function clearStartupIssues(): void {
  issues.length = 0;
}

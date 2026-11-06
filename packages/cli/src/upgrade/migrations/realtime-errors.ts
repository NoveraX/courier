import { type MovedName, moveImports } from "../codemod/move-imports";
import type { Migration } from "../migration";

const ROOT = "@noverax/courier";
const REALTIME = "@noverax/courier/realtime";

/* The realtime errors the package's root gave in 0.4, which the realtime entry gives now, and its timeout's new name. */
const MOVES: readonly MovedName[] = [
  ...["AuthError", "ForbiddenError", "RateLimitError", "fromErrorCode", "isRealtimeError"].map(
    (name) => ({ from: ROOT, name, to: REALTIME }),
  ),
  { from: ROOT, name: "TimeoutError", to: REALTIME, as: "RealtimeTimeoutError" },
  { from: REALTIME, name: "TimeoutError", to: REALTIME, as: "RealtimeTimeoutError" },
];

/**
 * 0.5.0: the realtime errors are imported from `@noverax/courier/realtime`,
 * which loads them with the realtime client, and 0.4's realtime
 * `TimeoutError` is `RealtimeTimeoutError` — the root's `TimeoutError` is
 * a call's now. `RealtimeError` and `ConnectionError` stay on the root.
 */
export const REALTIME_ERRORS: Migration = {
  id: "0.5.0/realtime-errors",
  title: "imports the realtime errors from @noverax/courier/realtime",
  mentions: MOVES.map((move) => move.name),
  migrate: (file) => ({ edits: moveImports(file, MOVES), findings: [], packages: [] }),
};

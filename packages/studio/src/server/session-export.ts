/**
 * Session export — barrel re-exports for all formats.
 */

import type { SavedSession } from "./session-types";

export { exportAsHar } from "./session-export-har";
export { exportAsPostman } from "./session-export-postman";

/** JSON export — returns the session as-is (Courier format, reimportable) */
export function exportAsJson(session: SavedSession): SavedSession {
  return session;
}

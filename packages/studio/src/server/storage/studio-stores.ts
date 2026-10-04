import { createRequestLog, type RequestLog } from "../request-log";
import { createMockLog, type MockLog } from "./mock-log";
import { createPlaygroundHistory, type PlaygroundHistory } from "./playground-history";
import { createSessionStore, type SessionStore } from "./session-rows";
import { openStudioDb } from "./studio-db";
import { createStudioView, type StudioView } from "./studio-view";

/** Everything Studio keeps in its database for a project, opened and closed together. */
export interface StudioStores {
  requestLog: RequestLog;
  sessions: SessionStore;
  view: StudioView;
  mockLog: MockLog;
  playgroundHistory: PlaygroundHistory;
  /** Close the stores that hold statements open, then the database. */
  close(): void;
}

/**
 * Open Studio's database for a project, and every store kept in it.
 *
 * @param root - The project root, symlinks resolved
 * @returns The stores, and how to close them
 * @example
 * ```ts
 * const stores = openStudioStores(root);
 * uiSocket.emit("events:replay", stores.requestLog.events());
 * stores.close();
 * ```
 */
export function openStudioStores(root: string): StudioStores {
  const storage = openStudioDb(root);
  const requestLog = createRequestLog(storage.db);
  const mockLog = createMockLog(storage.db);
  return {
    requestLog,
    sessions: createSessionStore(storage.db),
    view: createStudioView(storage.db),
    mockLog,
    playgroundHistory: createPlaygroundHistory(storage.db),
    close() {
      requestLog.close();
      mockLog.close();
      storage.close();
    },
  };
}

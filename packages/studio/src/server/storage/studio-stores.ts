import { createRequestLog, type RequestLog } from "../request-log";
import { trimFreedRoom } from "../storage-space/compact-db";
import { createMockConditionsStore, type MockConditionsStore } from "./mock-conditions-store";
import { createMockLog, type MockLog } from "./mock-log";
import { createPageState, type PageState } from "./page-state";
import { createPlaygroundHistory, type PlaygroundHistory } from "./playground-history";
import { createRequestPins, type RequestPins } from "./request-pins";
import { createSessionStore, type SessionStore } from "./session-rows";
import { openStudioDb, type StudioDb } from "./studio-db";
import { createStudioView, type StudioView } from "./studio-view";

/** Everything Studio keeps in its database for a project, opened and closed together. */
/* How often freed room is looked for, and given back once there is enough. */
const TRIM_EVERY_MS = 60_000;

export interface StudioStores {
  requestLog: RequestLog;
  sessions: SessionStore;
  view: StudioView;
  mockLog: MockLog;
  playgroundHistory: PlaygroundHistory;
  /** What the pages keep in the project: their settings, drafts and progress */
  pageState: PageState;
  /** The requests pinned on the pages */
  pins: RequestPins;
  /** The conditions set on each mock: its network conditions and the scenario applied */
  mockConditions: MockConditionsStore;
  /** The database they are kept in */
  storage: StudioDb;
  close(): void;
}

/**
 * Open Studio's database for a project, and every store kept in it.
 *
 * @param root - The project root, symlinks resolved
 * @param replayBytes - How much of each log a page is sent as it connects; the logs' own budget unless given
 * @returns The stores, and how to close them
 * @example
 * ```ts
 * const stores = openStudioStores(root);
 * uiSocket.emit("events:replay", stores.requestLog.events());
 * stores.close();
 * ```
 */
export function openStudioStores(root: string, replayBytes?: number): StudioStores {
  const storage = openStudioDb(root);
  const pins = createRequestPins(storage.db);
  const requestLog = createRequestLog(storage.db, replayBytes, pins.has);
  const mockLog = createMockLog(storage.db, replayBytes);
  /* The logs let their oldest requests go as new ones come: the room they took goes back to the disk. */
  const trim = setInterval(() => trimFreedRoom(storage.db), TRIM_EVERY_MS);
  trim.unref();
  return {
    requestLog,
    sessions: createSessionStore(storage.db),
    view: createStudioView(storage.db),
    mockLog,
    playgroundHistory: createPlaygroundHistory(storage.db),
    pageState: createPageState(storage.db),
    pins,
    mockConditions: createMockConditionsStore(storage.db),
    storage,
    close() {
      clearInterval(trim);
      requestLog.close();
      mockLog.close();
      storage.close();
    },
  };
}

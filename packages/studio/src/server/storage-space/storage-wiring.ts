import type { Namespace } from "socket.io";

import type { StudioStores } from "../storage/studio-stores";
import { databaseOnDisk } from "./database-size";
import type { StoreMocks } from "./reset-mock-stores";
import type { StorageRouteDeps } from "./storage-routes";

/* How often every page is told the room the database takes. */
const DATABASE_SIZE_EVERY_MS = 10 * 60_000;

/** Studio's storage as its pages and its API reach it. */
export interface StorageWiring {
  /** The room the database takes on disk, which each page is told as it connects. */
  databaseSize: () => number;
  /** What the Storage routes reach. */
  routes: StorageRouteDeps;
  /** Stop telling the pages the size. */
  stop: () => void;
}

/**
 * Wire Studio's storage to its pages: each is told the room the database
 * takes as it connects, every ten minutes, and after a clear — so a page
 * past the size set says so — and every page is told what a clear took, to
 * let go of its own copy.
 *
 * @param deps - Studio's stores, the project, its mocks, and the pages' namespace
 * @returns The size, the routes' needs, and how to stop
 * @example
 * ```ts
 * const storage = wireStorage({ stores, root, mocks: mockManager, uiNamespace });
 * registerStorageRoutes(app, storage.routes);
 * ```
 */
export function wireStorage(deps: {
  stores: StudioStores;
  root: string;
  mocks: StoreMocks;
  uiNamespace: Namespace;
}): StorageWiring {
  const { stores, root, mocks, uiNamespace } = deps;
  const databaseSize = () => databaseOnDisk(root, stores.storage.persistent);
  const tell = () => uiNamespace.emit("storage:size", { onDisk: databaseSize() });
  const timer = setInterval(tell, DATABASE_SIZE_EVERY_MS);
  timer.unref();
  return {
    databaseSize,
    routes: {
      stores,
      root,
      mocks,
      announce: (kinds) => {
        uiNamespace.emit("storage:cleared", { kinds });
        tell();
      },
    },
    stop: () => clearInterval(timer),
  };
}

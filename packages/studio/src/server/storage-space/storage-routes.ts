import { sendRouteFailure } from "../route-failure";
import type { RouteApp } from "../route-types";
import type { StudioStores } from "../storage/studio-stores";
import { clearStorage } from "./clear-storage";
import { compactDb } from "./compact-db";
import { resetMockStores, type StoreMocks } from "./reset-mock-stores";
import { isStorageKind, type StorageKind } from "./storage-kinds";
import { storageReport } from "./storage-report";

export interface StorageRouteDeps {
  stores: StudioStores;
  root: string;
  mocks: StoreMocks;
  /** Tell every page what was cleared, so each lets go of its own copy. */
  announce: (kinds: readonly StorageKind[]) => void;
}

/* What a page asked to clear: one or more kinds, each named once. */
function kindsOf(body: unknown): StorageKind[] | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const kinds: unknown = Reflect.get(body, "kinds");
  if (!Array.isArray(kinds) || kinds.length === 0 || !kinds.every(isStorageKind)) return undefined;
  return [...new Set(kinds)];
}

/**
 * The Storage settings' routes: what Studio keeps and how much room each
 * part takes, clearing parts of it, and compacting the database. Clearing
 * and compacting change the project's data, so they need the token.
 *
 * @param app - Studio's REST API
 * @param deps - Studio's stores, the project, its mocks, and how the pages are told
 * @example
 * ```ts
 * registerStorageRoutes(app, { stores, root, mocks: mockManager, announce });
 * ```
 */
export function registerStorageRoutes(app: RouteApp, deps: StorageRouteDeps): void {
  const { stores, root, mocks, announce } = deps;
  const report = () => storageReport(stores.storage.db, stores.storage.persistent, root);

  app.post("/api/storage", (_req, res) => {
    try {
      res.json(report());
    } catch (err) {
      sendRouteFailure(res, err, "Failed to measure Studio's storage");
    }
  });

  app.post("/api/storage/clear", async (req, res) => {
    const kinds = kindsOf(req.body);
    if (!kinds) {
      res.status(400).json({
        error:
          "Name what to clear: requests, mockLogs, playground, sessions, mockStores or backups.",
      });
      return;
    }
    try {
      await clearStorage(kinds, {
        stores,
        root,
        resetMockStores: () => resetMockStores(root, mocks),
      });
      announce(kinds);
      res.json(report());
    } catch (err) {
      sendRouteFailure(res, err, "Failed to clear Studio's storage");
    }
  });

  app.post("/api/storage/compact", (_req, res) => {
    try {
      if (stores.storage.persistent) compactDb(stores.storage.db);
      res.json(report());
    } catch (err) {
      sendRouteFailure(res, err, "Failed to compact Studio's database");
    }
  });
}

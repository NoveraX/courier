/**
 * File watcher — monitors project files and pushes change events via Socket.IO.
 *
 * Uses in-memory snapshots of cache/registry with lazy invalidation
 * to avoid disk reads on every file change.
 */

import { watch } from "chokidar";
import type { Namespace } from "socket.io";
import type { FingerprintCache } from "../apis/registry/cache";
import { loadCache } from "../apis/registry/cache";
import { loadRegistry } from "../apis/registry/registry";
import type { RegistryConfig } from "../apis/registry/types";
import { scanProject } from "../apis/scanner";
import { scanToSourceMap } from "../apis/scanner/scan-to-source-map";
import { resolveProject } from "../context";
import { syncUserModified } from "./sync-user-modified";
import type { SessionInfo } from "./types";

export interface FileChangeEvent {
  type: "scan" | "registry";
  timestamp: number;
}

const DEBOUNCE_MS = 300;
const REGISTRY_FILE = "registry.nexus.json";
const TS_EXTENSIONS = /\.(ts|tsx|js|jsx)$/;

/** Lazy-invalidation snapshot — avoids disk reads until data is actually needed */
function createSnapshot() {
  let cache: FingerprintCache | null = null;
  let registry: RegistryConfig | null = null;

  return {
    invalidate: () => {
      cache = null;
      registry = null;
    },
    getCache: (): FingerprintCache => (cache ??= loadCache()),
    getRegistry: (): RegistryConfig => (registry ??= loadRegistry()),
  };
}

/** Start watching project files, emit changes to UI and app namespaces */
export function startFileWatcher(
  uiNamespace: Namespace,
  appNamespace?: Namespace,
  sessions?: Map<string, SessionInfo>,
): () => void {
  const initialRegistry = loadRegistry();
  const scanPaths = initialRegistry.scanPaths ?? ["src/api"];
  const snapshot = createSnapshot();

  const watchPaths = [...scanPaths.map((p) => resolveProject(p)), resolveProject(REGISTRY_FILE)];

  const watcher = watch(watchPaths, {
    ignoreInitial: true,
    ignored: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    persistent: true,
  });

  let scanTimer: ReturnType<typeof setTimeout> | null = null;
  let registryTimer: ReturnType<typeof setTimeout> | null = null;
  let modifiedTimer: ReturnType<typeof setTimeout> | null = null;

  const debounce = (timer: ReturnType<typeof setTimeout> | null, ms: number, fn: () => void) => {
    if (timer) clearTimeout(timer);
    return setTimeout(fn, ms);
  };

  const emitScanUpdate = () => {
    scanTimer = debounce(scanTimer, DEBOUNCE_MS, () => {
      try {
        const scan = scanProject();
        uiNamespace.emit("scan:updated", scan);

        // Push scan-derived source map into all active sessions so the
        // Playground/Explorer always reflect file-system truth — even when
        // the app's runtime registry hasn't been updated by HMR yet.
        if (sessions && sessions.size > 0) {
          const freshMap = scanToSourceMap(scan);
          if (Object.keys(freshMap).length > 0) {
            pushSourceMapToSessions(freshMap, sessions, uiNamespace);
          }
        }
      } catch (err) {
        console.warn("Failed to emit scan update:", err);
      }
    });
  };

  const emitRegistryUpdate = () => {
    registryTimer = debounce(registryTimer, DEBOUNCE_MS, () => {
      snapshot.invalidate();
      uiNamespace.emit("registry:updated", { timestamp: Date.now() });
    });
  };

  const scheduleModifiedCheck = (filePath: string) => {
    modifiedTimer = debounce(modifiedTimer, DEBOUNCE_MS + 200, () => {
      syncUserModified(filePath, snapshot);
    });
  };

  const handleChange = (filePath: string) => {
    if (filePath.endsWith(REGISTRY_FILE)) {
      emitRegistryUpdate();
      return;
    }
    if (TS_EXTENSIONS.test(filePath)) {
      emitScanUpdate();
      scheduleModifiedCheck(filePath);
      // Notify connected apps to re-emit their source map (hot reload fallback)
      appNamespace?.emit("sources:invalidate", { timestamp: Date.now() });
    }
  };

  watcher.on("add", handleChange);
  watcher.on("change", handleChange);
  watcher.on("unlink", handleChange);

  return () => {
    if (scanTimer) clearTimeout(scanTimer);
    if (registryTimer) clearTimeout(registryTimer);
    if (modifiedTimer) clearTimeout(modifiedTimer);
    void watcher.close();
  };
}

/** Replace session source maps with scan-derived data and notify UI */
function pushSourceMapToSessions(
  freshMap: Record<string, unknown>,
  sessions: Map<string, SessionInfo>,
  uiNamespace: Namespace,
): void {
  for (const [, session] of sessions) {
    session.sources = freshMap;
    uiNamespace.emit("event", {
      id: session.sessionId,
      type: "connection:sources",
      timestamp: Date.now(),
      sessionId: session.sessionId,
      sources: freshMap,
    });
  }
}

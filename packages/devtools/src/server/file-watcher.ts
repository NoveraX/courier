/**
 * File watcher — monitors project files and pushes change events via Socket.IO.
 *
 * Uses in-memory snapshots of cache/registry with lazy invalidation
 * to avoid disk reads on every file change.
 */

import { watch } from "chokidar";
import type { Namespace } from "socket.io";
import type { FingerprintCache } from "../codegen/registry/cache";
import { loadCache } from "../codegen/registry/cache";
import { loadRegistry } from "../codegen/registry/registry";
import type { RegistryConfig } from "../codegen/registry/types";
import { scanProject } from "../codegen/scanner";
import { resolveProject } from "../context";
import { syncUserModified } from "./sync-user-modified";

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

/** Start watching project files, emit changes to UI namespace */
export function startFileWatcher(uiNamespace: Namespace): () => void {
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
        uiNamespace.emit("scan:updated", scanProject());
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

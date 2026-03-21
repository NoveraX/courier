/**
 * File watcher — monitors project files and pushes scan results
 * into the CatalogStore (scan layer).
 *
 * Uses native fs.watch with recursive: true (stable on macOS/Linux 20.12+/Windows).
 * Zero dependencies — no chokidar needed.
 */

import type { FSWatcher } from "node:fs";
import { existsSync, watch as fsWatch } from "node:fs";
import { relative } from "node:path";
import type { Namespace } from "socket.io";

import type { FingerprintCache } from "../apis/registry/cache";
import { loadCache } from "../apis/registry/cache";
import { listSources, loadRegistry } from "../apis/registry/registry";
import type { RegistryConfig } from "../apis/registry/types";
import { scanProject } from "../apis/scanner";
import { scanToSourceMap } from "../apis/scanner/scan-to-source-map";
import { resolveProject } from "../context";
import { onEnvChange } from "../runtime-env";
import type { CatalogStore } from "./catalog";
import { syncUserModified } from "./sync-user-modified";

export interface FileChangeEvent {
  type: "scan" | "registry";
  timestamp: number;
}

const DEBOUNCE_MS = 300;
const REGISTRY_FILE = "registry.nexus.json";
const TS_EXTENSIONS = /\.(ts|tsx|js|jsx)$/;
const IGNORED = /node_modules|dist|\.next/;

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

/** Start watching project files, push scan results into CatalogStore */
export function startFileWatcher(uiNamespace: Namespace, catalogStore: CatalogStore): () => void {
  const initialRegistry = loadRegistry();
  const scanPaths = initialRegistry.scanPaths ?? ["src/api"];
  const snapshot = createSnapshot();

  const watchers: FSWatcher[] = [];

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

        const freshMap = scanToSourceMap(scan);
        if (Object.keys(freshMap).length > 0) {
          catalogStore.setScanLayer(freshMap);
        }
      } catch (err) {
        console.warn("Failed to emit scan update:", err);
      }
    });
  };

  const emitRegistryUpdate = () => {
    registryTimer = debounce(registryTimer, DEBOUNCE_MS, () => {
      snapshot.invalidate();
      try {
        const config = loadRegistry();
        uiNamespace.emit("registry:updated", { sources: listSources(config) });
      } catch (err) {
        console.warn("Failed to emit registry update:", err);
      }
    });
  };

  const scheduleModifiedCheck = (filePath: string) => {
    modifiedTimer = debounce(modifiedTimer, DEBOUNCE_MS + 200, () => {
      syncUserModified(filePath, snapshot);
    });
  };

  const handleChange = (filename: string, basePath: string) => {
    if (!filename || IGNORED.test(filename)) return;

    const filePath = resolveProject(`${relative(resolveProject("."), basePath)}/${filename}`);

    if (filename.endsWith(REGISTRY_FILE) || filename === REGISTRY_FILE) {
      emitRegistryUpdate();
      return;
    }
    if (TS_EXTENSIONS.test(filename)) {
      emitScanUpdate();
      scheduleModifiedCheck(filePath);
    }
  };

  // Watch scan paths recursively
  for (const scanPath of scanPaths) {
    const fullPath = resolveProject(scanPath);
    if (!existsSync(fullPath)) continue;

    const w = fsWatch(fullPath, { recursive: true, persistent: true }, (_event, filename) => {
      if (filename) handleChange(filename, fullPath);
    });
    watchers.push(w);
  }

  // Watch registry file
  const registryPath = resolveProject(REGISTRY_FILE);
  if (existsSync(registryPath)) {
    const w = fsWatch(registryPath, { persistent: true }, () => {
      emitRegistryUpdate();
    });
    watchers.push(w);
  }

  // Re-scan when app sends updated process.env
  const unsubEnv = onEnvChange(emitScanUpdate);

  return () => {
    if (scanTimer) clearTimeout(scanTimer);
    if (registryTimer) clearTimeout(registryTimer);
    if (modifiedTimer) clearTimeout(modifiedTimer);
    unsubEnv();
    for (const w of watchers) w.close();
  };
}

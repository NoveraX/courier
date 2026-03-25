import type { FSWatcher } from "node:fs";
import { existsSync, watch as fsWatch, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

import type { MetaResult, MetaRoute, MetaScenario } from "./meta-pool";
import { createMetaPool } from "./meta-pool";

/** Route info extracted from server config at scan time */
export type DeclaredRoute = MetaRoute;

/** Declared mock server discovered from the mock-servers/ directory */
export interface DeclaredServer {
  id: string;
  filePath: string;
  relativePath: string;
  name: string;
  lastModified: number;
  autoStart: boolean;
  routes: DeclaredRoute[];
  collections: string[];
  scenarios: MetaScenario[];
}

export interface ScannerEvents {
  onDeclared: (server: DeclaredServer) => void;
  onChanged: (server: DeclaredServer) => void;
  onRemoved: (serverId: string) => void;
}

const DEBOUNCE_MS = 500;
const SERVER_SUFFIX = ".server.ts";
const DIR_ENTRY = "server.ts";

function isServerEntry(relPath: string): boolean {
  const name = basename(relPath);
  return name.endsWith(SERVER_SUFFIX) || name === DIR_ENTRY;
}

function deriveServerName(relPath: string): string {
  const name = basename(relPath);
  if (name === DIR_ENTRY) return basename(dirname(relPath));
  return name.replace(/\.server\.ts$/, "");
}

function deriveServerId(relPath: string): string {
  return deriveServerName(relPath);
}

const FALLBACK_META: MetaResult = { autoStart: false, routes: [], collections: [], scenarios: [] };

export function createScanner(mocksDir: string, events: ScannerEvents) {
  let watcher: FSWatcher | undefined;
  let parentWatcher: FSWatcher | undefined;
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const knownServers = new Map<string, string>();
  const pool = createMetaPool();

  async function buildDeclared(filePath: string): Promise<DeclaredServer> {
    const rel = relative(mocksDir, filePath);
    const meta = (await pool.analyze(filePath)) ?? FALLBACK_META;
    return {
      id: deriveServerId(rel),
      filePath,
      relativePath: rel,
      name: deriveServerName(rel),
      lastModified: statSync(filePath).mtimeMs,
      ...meta,
    };
  }

  function handleChange(filename: string): void {
    if (!filename || !isServerEntry(filename)) return;

    const filePath = join(mocksDir, filename);
    const id = deriveServerId(filename);

    clearTimeout(debounceTimers.get(id));
    debounceTimers.set(
      id,
      setTimeout(() => {
        debounceTimers.delete(id);

        if (existsSync(filePath)) {
          void buildDeclared(filePath).then((server) => {
            if (knownServers.has(id)) {
              events.onChanged(server);
            } else {
              knownServers.set(id, filename);
              events.onDeclared(server);
            }
          });
        } else if (knownServers.has(id)) {
          knownServers.delete(id);
          events.onRemoved(id);
        }
      }, DEBOUNCE_MS),
    );
  }

  /** Discover all server files and analyze them in parallel */
  function collectEntries(): Array<{ id: string; rel: string; path: string }> {
    const entries: Array<{ id: string; rel: string; path: string }> = [];

    for (const entry of readdirSync(mocksDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(SERVER_SUFFIX)) {
        const rel = entry.name;
        entries.push({ id: deriveServerId(rel), rel, path: join(mocksDir, rel) });
      } else if (entry.isDirectory()) {
        const serverFile = join(mocksDir, entry.name, DIR_ENTRY);
        if (existsSync(serverFile)) {
          const rel = `${entry.name}/${DIR_ENTRY}`;
          entries.push({ id: deriveServerId(rel), rel, path: serverFile });
        }
      }
    }
    return entries;
  }

  async function initialScan(): Promise<void> {
    const entries = collectEntries();
    const results = await Promise.all(entries.map((e) => buildDeclared(e.path)));

    for (const [i, entry] of entries.entries()) {
      const server = results[i];
      if (server) {
        knownServers.set(entry.id, entry.rel);
        events.onDeclared(server);
      }
    }
  }

  function startWatching(): void {
    if (watcher) return;

    // Fire-and-forget: events stream to UI as each server is analyzed
    void initialScan();

    watcher = fsWatch(mocksDir, { recursive: true, persistent: true }, (_event, filename) => {
      if (filename) handleChange(filename);
    });

    parentWatcher?.close();
    parentWatcher = undefined;
  }

  function start(): void {
    if (existsSync(mocksDir)) {
      startWatching();
      return;
    }

    // Watch parent directory for mock-servers/ creation
    const parentDir = dirname(mocksDir);
    const targetName = basename(mocksDir);

    parentWatcher = fsWatch(parentDir, { persistent: true }, (_event, filename) => {
      if (filename === targetName && existsSync(mocksDir)) {
        startWatching();
      }
    });
  }

  function stop(): void {
    for (const timer of debounceTimers.values()) clearTimeout(timer);
    debounceTimers.clear();
    watcher?.close();
    watcher = undefined;
    parentWatcher?.close();
    parentWatcher = undefined;
    pool.shutdown();
  }

  return { start, stop };
}

export type Scanner = ReturnType<typeof createScanner>;

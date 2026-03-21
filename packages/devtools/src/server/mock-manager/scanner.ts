import { execFileSync } from "node:child_process";
import type { FSWatcher } from "node:fs";
import { existsSync, watch as fsWatch, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

/** Route info extracted from server config at scan time */
export interface DeclaredRoute {
  group: string;
  endpoint: string;
  httpMethod: string;
  path: string;
  fullPath: string;
  source: "auto";
  hits: 0;
}

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

interface ServerMeta {
  autoStart: boolean;
  routes: DeclaredRoute[];
  collections: string[];
}

const FALLBACK_META: ServerMeta = { autoStart: false, routes: [], collections: [] };

/** Read server metadata (autoStart, routes, collections) via tsx child process */
function readServerMeta(filePath: string): ServerMeta {
  try {
    const script = `
      Promise.all([
        import("${filePath}"),
        import("@noverax/nexus-mock/route-analyzer"),
      ]).then(([m, { analyzeRoutes }]) => {
        const c = m.mockServer ?? m.default;
        const groups = c?.source?.options?.groups;
        const routes = groups ? analyzeRoutes(groups) : [];
        const collections = [...new Set(routes.map(r => r.group))];
        const result = {
          autoStart: c?.autoStart === true,
          routes: routes.map(r => ({
            group: r.group,
            endpoint: r.endpoint,
            httpMethod: r.httpMethod,
            path: r.path,
            fullPath: r.fullPath,
            source: "auto",
            hits: 0,
          })),
          collections,
        };
        process.stdout.write(JSON.stringify(result));
      }).catch(() => process.stdout.write("null"));
    `;
    const raw = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const parsed = JSON.parse(raw) as ServerMeta | null;
    return parsed ?? FALLBACK_META;
  } catch {
    return FALLBACK_META;
  }
}

export function createScanner(mocksDir: string, events: ScannerEvents) {
  let watcher: FSWatcher | undefined;
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const knownServers = new Map<string, string>();

  function buildDeclared(filePath: string): DeclaredServer {
    const rel = relative(mocksDir, filePath);
    const meta = readServerMeta(filePath);
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
          const server = buildDeclared(filePath);
          if (knownServers.has(id)) {
            events.onChanged(server);
          } else {
            knownServers.set(id, filename);
            events.onDeclared(server);
          }
        } else if (knownServers.has(id)) {
          knownServers.delete(id);
          events.onRemoved(id);
        }
      }, DEBOUNCE_MS),
    );
  }

  function initialScan(): void {
    for (const entry of readdirSync(mocksDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(SERVER_SUFFIX)) {
        const rel = entry.name;
        knownServers.set(deriveServerId(rel), rel);
        events.onDeclared(buildDeclared(join(mocksDir, rel)));
      } else if (entry.isDirectory()) {
        const serverFile = join(mocksDir, entry.name, DIR_ENTRY);
        if (existsSync(serverFile)) {
          const rel = `${entry.name}/${DIR_ENTRY}`;
          knownServers.set(deriveServerId(rel), rel);
          events.onDeclared(buildDeclared(serverFile));
        }
      }
    }
  }

  let parentWatcher: FSWatcher | undefined;

  function startWatching(): void {
    if (watcher) return;

    initialScan();

    watcher = fsWatch(mocksDir, { recursive: true, persistent: true }, (_event, filename) => {
      if (filename) handleChange(filename);
    });

    // Stop watching parent once mock dir exists
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
  }

  return { start, stop };
}

export type Scanner = ReturnType<typeof createScanner>;

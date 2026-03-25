/**
 * Persistent worker pool for mock server metadata extraction.
 * Forks a single child process (meta-worker) that stays alive across requests,
 * eliminating cold-start overhead (tsx + module loading) on every file scan.
 *
 * Pattern: Jest/Vite-style persistent worker with IPC request/response.
 */

import type { ChildProcess } from "node:child_process";
import { fork } from "node:child_process";

const REQUEST_TIMEOUT = 5000;

export interface MetaRoute {
  group: string;
  endpoint: string;
  httpMethod: string;
  path: string;
  fullPath: string;
  source: "auto";
  hits: 0;
  [key: string]: unknown;
}

export interface MetaScenario {
  name: string;
  endpointCount: number;
  isActive: boolean;
  endpoints: Array<{
    group: string;
    endpoint: string;
    httpMethod: string;
    behavior: "resolves" | "returns" | "rejects" | "custom";
    latency?: number;
  }>;
}

export interface MetaResult {
  autoStart: boolean;
  routes: MetaRoute[];
  collections: string[];
  scenarios: MetaScenario[];
}

interface PendingRequest {
  resolve: (meta: MetaResult | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Resolve the compiled meta-worker entry point via standard ESM resolution */
function resolveWorkerPath(): string {
  const resolved = import.meta.resolve("@noverax/nexus-mock/meta-worker");
  return resolved.startsWith("file://") ? resolved.slice(7) : resolved;
}

export function createMetaPool() {
  let worker: ChildProcess | undefined;
  let ready = false;
  let idCounter = 0;
  const pending = new Map<string, PendingRequest>();
  const waitQueue: Array<() => void> = [];

  function spawnWorker(): void {
    worker = fork(resolveWorkerPath(), [], {
      execArgv: ["--import", "tsx/esm"],
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });

    worker.on("message", (raw: unknown) => {
      const msg = raw as { type: string; id?: string; meta?: MetaResult | null };

      if (msg.type === "ready") {
        ready = true;
        for (const fn of waitQueue.splice(0)) fn();
      } else if (msg.type === "result" && msg.id) {
        const req = pending.get(msg.id);
        if (!req) return;
        clearTimeout(req.timer);
        pending.delete(msg.id);
        req.resolve(msg.meta ?? null);
      }
    });

    worker.on("exit", () => {
      ready = false;
      // Reject all in-flight requests on crash
      for (const [, req] of pending) {
        clearTimeout(req.timer);
        req.resolve(null);
      }
      pending.clear();
      worker = undefined;
    });
  }

  function ensureWorker(): Promise<void> {
    if (ready) return Promise.resolve();
    if (!worker) spawnWorker();
    return new Promise((r) => waitQueue.push(r));
  }

  async function analyze(filePath: string): Promise<MetaResult | null> {
    await ensureWorker();

    const id = `req_${++idCounter}`;
    return new Promise<MetaResult | null>((resolveReq) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolveReq(null);
      }, REQUEST_TIMEOUT);

      pending.set(id, { resolve: resolveReq, timer });
      worker?.send({ type: "analyze", id, filePath });
    });
  }

  function shutdown(): void {
    if (worker?.connected) worker.send({ type: "shutdown" });
    worker?.kill("SIGTERM");

    for (const [, req] of pending) {
      clearTimeout(req.timer);
      req.resolve(null);
    }
    pending.clear();
    worker = undefined;
    ready = false;
  }

  return { analyze, shutdown };
}

export type MetaPool = ReturnType<typeof createMetaPool>;

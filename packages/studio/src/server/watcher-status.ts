/**
 * What Studio watches, as the pages show it: the number of files of the
 * project it reloads on — the config, the mocks file and the modules they
 * import — and each change it saw.
 */

import type { Namespace, Socket } from "socket.io";

export interface WatcherSnapshot {
  apiPaths: number;
  timestamp: number;
}

export function createWatcherStatus(uiNamespace: Namespace) {
  let apiPaths = 0;

  function buildSnapshot(): WatcherSnapshot {
    return { apiPaths, timestamp: Date.now() };
  }

  function emitStatus(): void {
    uiNamespace.emit("watcher:status", buildSnapshot());
  }

  function setApiPathCount(count: number): void {
    if (count === apiPaths) return;
    apiPaths = count;
    emitStatus();
  }

  function emitChange(source: "api" | "mock", files: string[]): void {
    uiNamespace.emit("watcher:change", {
      source,
      files,
      timestamp: Date.now(),
    });
  }

  /** Send current state to a newly connected UI socket */
  function sendSnapshot(socket: Socket): void {
    socket.emit("watcher:status", buildSnapshot());
  }

  return { setApiPathCount, emitChange, sendSnapshot };
}

export type WatcherStatus = ReturnType<typeof createWatcherStatus>;

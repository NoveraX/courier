/**
 * Unified watcher status coordinator — aggregates file watcher
 * and mock scanner state, emits events to the UI namespace.
 */

import type { Namespace, Socket } from "socket.io";

export interface WatcherSnapshot {
  apiPaths: number;
  mockFiles: number;
  timestamp: number;
}

export function createWatcherStatus(uiNamespace: Namespace) {
  let apiPaths = 0;
  let mockFiles = 0;

  function buildSnapshot(): WatcherSnapshot {
    return { apiPaths, mockFiles, timestamp: Date.now() };
  }

  function emitStatus(): void {
    uiNamespace.emit("watcher:status", buildSnapshot());
  }

  function setApiPathCount(count: number): void {
    if (count === apiPaths) return;
    apiPaths = count;
    emitStatus();
  }

  function setMockFileCount(count: number): void {
    if (count === mockFiles) return;
    mockFiles = count;
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

  return { setApiPathCount, setMockFileCount, emitChange, sendSnapshot };
}

export type WatcherStatus = ReturnType<typeof createWatcherStatus>;

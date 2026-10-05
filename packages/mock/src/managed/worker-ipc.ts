/**
 * IPC helpers for the worker child process.
 * Handles communication with the Studio parent process.
 */

import type { ChildMessage } from "./types";

/**
 * End the worker when Studio goes away. The IPC channel closes the moment the
 * parent dies, however it died, so the worker never outlives it.
 */
export function watchParent(): void {
  process.once("disconnect", () => process.exit(0));
}

export function send(msg: ChildMessage): void {
  process.send?.(msg);
}

export function sendError(message: string, fatal: boolean): void {
  send({ type: "error", message, fatal });
  if (fatal) process.exit(1);
}

/**
 * IPC helpers for the worker child process.
 * Handles communication with the Studio parent process.
 */

import type { MockServer } from "../server/create-mock-server";
import type { ChildMessage } from "./types";

const PARENT_CHECK_INTERVAL = 5000;

/** Ensure child dies if parent dies */
const parentPid = process.ppid;
export const parentCheck = setInterval(() => {
  try {
    process.kill(parentPid, 0);
  } catch {
    process.exit(0);
  }
}, PARENT_CHECK_INTERVAL);

export function send(msg: ChildMessage): void {
  process.send?.(msg);
}

export function sendError(message: string, fatal: boolean): void {
  send({ type: "error", message, fatal });
  if (fatal) {
    clearInterval(parentCheck);
    process.exit(1);
  }
}

export function sendStoreSnapshot(server: MockServer): void {
  send({
    type: "event",
    event: {
      type: "mock:store:snapshot",
      collections: server.store.list().map((name) => ({
        name,
        count: server.store.collection(name).count(),
        records: server.store.collection(name).getAll(),
      })),
    },
  });
}

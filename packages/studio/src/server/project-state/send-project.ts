import { createLogger } from "@noverax/courier";
import { configStatusOf } from "./config-status";
import { sendImportLists } from "./send-import-lists";
import type { ProjectEventTarget, ProjectSnapshot } from "./types";

const log = createLogger("Studio");

/**
 * Tell the UI the project Studio runs: the imports list and the source
 * catalogue, then `config:status`. The status comes last, so a UI that has
 * it knows the lists before it describe the same state. While Studio is
 * starting there are no lists yet, and only the status is sent.
 *
 * The status is sent even when the lists cannot be built: the UI must still
 * learn how the config loads.
 *
 * Synchronous on purpose, and it must stay so: the UI takes the order its
 * packets arrive in as the order of the project's states, and socket.io
 * writes each socket's packets in the order they are sent. An `await` here
 * would let a later outcome overtake an earlier one.
 *
 * @param target - Every UI, or the one that connected
 * @param snapshot - The project as Studio runs it
 * @param root - The project root, symlinks resolved
 *
 * @example
 * ```ts
 * sendProject(uiNamespace, project.snapshot(), root);
 * ```
 */
export function sendProject(
  target: ProjectEventTarget,
  snapshot: ProjectSnapshot,
  root: string,
): void {
  if (!snapshot.starting) {
    try {
      sendImportLists(target, snapshot, root);
    } catch (err) {
      log.warn("Studio could not send the imports and sources to the UI", err);
    }
  }
  target.emit("config:status", configStatusOf(snapshot, root));
}

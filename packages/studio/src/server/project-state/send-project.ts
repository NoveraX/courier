import { createLogger } from "@noverax/courier";
import { cutText } from "@noverax/courier-studio-core";

import type { UpdateChecks } from "../update-checks";
import { type ConfigStatusPayload, configStatusOf } from "./config-status";
import { emitToPages } from "./emit-to-pages";
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
 * learn how the config loads. A config that failed is told whole to a page
 * with Studio's token, and with what could be a credential cut from its
 * error's text to any other: a config that throws as it loads can say
 * anything it held.
 *
 * Synchronous on purpose, and it must stay so: the UI takes the order its
 * packets arrive in as the order of the project's states, and socket.io
 * writes each socket's packets in the order they are sent. An `await` here
 * would let a later outcome overtake an earlier one.
 *
 * @param target - Every UI, or the one that connected
 * @param snapshot - The project as Studio runs it
 * @param root - The project root, symlinks resolved
 * @param checks - The last update check of each import
 *
 * @example
 * ```ts
 * sendProject(uiNamespace, project.snapshot(), root, project.updateChecks);
 * ```
 */
export function sendProject(
  target: ProjectEventTarget,
  snapshot: ProjectSnapshot,
  root: string,
  checks: UpdateChecks,
): void {
  if (!snapshot.starting) {
    try {
      sendImportLists(target, snapshot, root, checks);
    } catch (err) {
      log.warn("Studio could not send the imports and sources to the UI", err);
    }
  }
  const status = configStatusOf(snapshot, root);
  emitToPages(target, "config:status", status, statusWithoutSecrets(status));
}

function statusWithoutSecrets(status: ConfigStatusPayload): ConfigStatusPayload {
  if (status.state !== "failed") return status;
  return { ...status, error: { ...status.error, message: cutText(status.error.message) } };
}

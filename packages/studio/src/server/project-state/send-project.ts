import { createLogger } from "@noverax/courier";
import { sliceWhole } from "@noverax/courier/internal";
import { withoutSecrets } from "@noverax/courier-build/config";

import type { UpdateChecks } from "../update-checks";
import { type ConfigStatusPayload, configStatusOf } from "./config-status";
import { emitToPages } from "./emit-to-pages";
import { sendImportLists } from "./send-import-lists";
import type { ProjectEventTarget, ProjectSnapshot } from "./types";

const log = createLogger("Studio");

/** The longest text of a failed config a page without Studio's token is told, in characters. */
const MAX_SHOWN_LENGTH = 2_000;

/**
 * Tell the UI the project Studio runs: the imports list and the source
 * catalogue, then `config:status`. The status comes last, so a UI that has
 * it knows the lists before it describe the same state. While Studio is
 * starting there are no lists yet, and only the status is sent.
 *
 * The status is sent even when the lists cannot be built: the UI must still
 * learn how the config loads. A config that failed is told to a page with
 * Studio's token as its failure says it, with no secret in what the code
 * threw, as `describeError` leaves none; any other page is told it with no
 * secret in the whole text, whatever wrote it, and cut to 2000 characters:
 * a config that throws as it loads can say anything it held.
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
  const said = withoutSecrets(status.error.message).trim();
  const message =
    said.length > MAX_SHOWN_LENGTH ? `${sliceWhole(said, MAX_SHOWN_LENGTH - 1)}…` : said;
  return { ...status, error: { ...status.error, message } };
}

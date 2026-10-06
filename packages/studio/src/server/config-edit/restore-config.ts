import { describeError } from "../describe-error";
import type { ExclusiveContext } from "../exclusive-context";
import { sha256Hex } from "../sha256-hex";
import { replaceConfigFile } from "./replace-config-file";

/** The config as it was before Studio changed it. */
export interface ConfigBefore {
  /** Its absolute path. */
  path: string;
  /** Its path relative to the project root, for the messages. */
  file: string;
  /** Its text before the change. */
  text: string;
  /** Its permission bits. */
  mode: number;
}

/**
 * Put the config back as it was before a change Studio wrote, and finish
 * saying why: Studio never ran the changed config, so once it is back, what
 * is on disk is again what Studio runs. A config Studio could not put back
 * is reloaded as it is once the edit ends, and the developer is told to
 * check it. Only the text Studio wrote is replaced: a save made since stays.
 *
 * @param tx - The edit, alone on the reload chain
 * @param before - The config as it was
 * @param written - The text Studio wrote
 * @param why - Why the change is taken back, as the start of a sentence
 * @param root - The project root, for the messages
 * @returns The whole reason, with what became of the config
 * @example
 * ```ts
 * const reason = restoreConfig(tx, before, plan.text, `${configFile} did not load once changed`, root);
 * ```
 */
export function restoreConfig(
  tx: ExclusiveContext,
  before: ConfigBefore,
  written: string,
  why: string,
  root: string,
): string {
  try {
    replaceConfigFile(before.path, before.text, {
      mode: before.mode,
      expectedHash: sha256Hex(written),
    });
    tx.acknowledge([before.path]);
    return `${why}, so Studio put ${before.file} back as it was.`;
  } catch (error) {
    tx.reloadAfter([before.path]);
    const failed = `Studio could not put it back (${describeError(error, root)})`;
    return `${why}, and ${failed}: check ${before.file}.`;
  }
}

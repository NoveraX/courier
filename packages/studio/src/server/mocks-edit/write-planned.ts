import { relative, sep } from "node:path";
import { createLogger } from "@noverax/courier";
import { describeError } from "./describe-error";
import { manualOutcome } from "./manual-outcome";
import { MocksEditRefusal } from "./mocks-edit-refusal";
import { MocksFileChangedError } from "./mocks-file-changed-error";
import type { PreparedEdit } from "./prepare-edit";
import { replaceMocksFile } from "./replace-mocks-file";
import type { ManualOutcome } from "./types";
import { writeNewMocksFile } from "./write-new-mocks-file";

const log = createLogger("Studio");

/** A write that happened, and the temporary file it could not remove, if any. */
export interface Written {
  /** A leftover temporary file, relative to the project root. */
  leftover: string | null;
  /** The same file, as an absolute path. */
  leftoverPath: string | null;
}

/**
 * Write the planned file: replace the existing one atomically, or create it.
 *
 * @param prepared - The planned edit
 * @returns The write, `"changed"` when the file changed on disk since it was read, or the reason to add the mocks by hand
 */
export function writePlanned(prepared: PreparedEdit): Written | "changed" | ManualOutcome {
  const { target, plan, input, root } = prepared;
  try {
    if (target.kind === "existing") {
      replaceMocksFile(target.path, plan.text, { mode: target.mode, expectedHash: target.hash });
      return { leftover: null, leftoverPath: null };
    }
    const leftoverPath = writeNewMocksFile(target.path, plan.text);
    return {
      leftover: leftoverPath ? relative(root, leftoverPath).split(sep).join("/") : null,
      leftoverPath,
    };
  } catch (err) {
    if (err instanceof MocksFileChangedError) return "changed";
    log.error(`Studio could not write ${target.relative}`, err);
    const message = `Studio could not write ${target.relative} (${describeError(err, root)}).`;
    return manualOutcome(
      new MocksEditRefusal("WRITE_FAILED", message, { cause: err }),
      input,
      target.relative,
    );
  }
}

import { join } from "node:path";
import { CONFIG_BASENAMES, MOCKS_BASENAMES } from "@noverax/courier-studio-core/config";
import { contentHashOf } from "./file-content-hash";
import type { ProjectInputs } from "./read-project-inputs";

/**
 * Hash every name the config or the mocks file may take in the project root,
 * before a load looks for either.
 *
 * Read first, so a file created under any of these names afterwards — one
 * that takes precedence over the file the load then finds included — differs
 * from the `null` recorded here, whether it appears while the load looks for
 * the entries, walks their modules or evaluates them.
 *
 * @param root - The project root, symlinks resolved
 * @returns Each name's absolute path and the hash of what it held: the sha256
 *   of its bytes, `null` when absent, `"unreadable"` when it cannot be read
 * @example
 * ```ts
 * const names = readEntryNames(root);
 * names.get(join(root, "courier.config.ts")); // null: no such file yet
 * ```
 */
export function readEntryNames(root: string): ProjectInputs {
  return new Map(
    [...CONFIG_BASENAMES, ...MOCKS_BASENAMES].map((name) => {
      const path = join(root, name);
      return [path, contentHashOf(path)];
    }),
  );
}

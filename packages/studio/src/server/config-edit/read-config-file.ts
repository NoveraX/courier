import { readRegularFile } from "@noverax/courier-cli/devkit";
import { describeError } from "../describe-error";
import { sha256Hex } from "../sha256-hex";
import { ConfigEditRefusal } from "./config-edit-refusal";

const UTF8 = new TextDecoder("utf-8", { fatal: true });

/** A config as read to change it. */
export interface ConfigFileRead {
  /** Its text. */
  text: string;
  /** sha256 of the bytes read, which a write quotes to be sure nothing saved meanwhile. */
  baseHash: string;
  /** Its permission bits, which the changed file keeps. */
  mode: number;
}

/**
 * Read the config Studio is about to change: its text, the hash of its
 * bytes and its permission bits — or why Studio cannot change it.
 *
 * @param path - The config's absolute path
 * @param configFile - The config, relative to the project root, for the messages
 * @param root - The project root, for the messages
 * @returns The config as read, or the refusal
 * @example
 * ```ts
 * const read = readConfigFile(loaded.configFile, "courier.config.ts", root);
 * if (!(read instanceof ConfigEditRefusal)) plan(read.text);
 * ```
 */
export function readConfigFile(
  path: string,
  configFile: string,
  root: string,
): ConfigFileRead | ConfigEditRefusal {
  try {
    const file = readRegularFile(path);
    if (file === null) {
      return new ConfigEditRefusal(
        "CONFIG_CHANGED",
        `${configFile} is gone since Studio loaded it.`,
      );
    }
    const text = UTF8.decode(file.bytes);
    return { text, baseHash: sha256Hex(file.bytes), mode: file.stats.mode & 0o7777 };
  } catch (error) {
    const why = `Studio could not read ${configFile} as a UTF-8 file (${describeError(error, root)})`;
    return new ConfigEditRefusal("CONFIG_UNREADABLE", `${why}.`, { cause: error });
  }
}

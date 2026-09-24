import { realpathSync } from "node:fs";
import { basename } from "node:path";
import { findConfigFileAt, findMocksFile } from "@noverax/courier-studio-core/config";
import { inspectCreatedMocks } from "./inspect-created-mocks";
import { inspectExistingMocks } from "./inspect-existing-mocks";
import { MocksEditRefusal } from "./mocks-edit-refusal";

/** The project's mocks file, read and cleared for an edit. */
export interface ExistingMocksTarget {
  kind: "existing";
  /** The file's path in the project root, links not resolved. */
  path: string;
  /** The path relative to the project root, with `/` separators. */
  relative: string;
  /** The file's name. */
  name: string;
  /** The file as it is on disk. */
  bytes: Buffer;
  /** The bytes decoded as UTF-8, a byte-order mark kept. */
  text: string;
  /** sha256 of `bytes`, as hex. */
  hash: string;
  /** Its permission bits, which the edited file keeps. */
  mode: number;
  /** The name of the project's `courier.config.*`. */
  configName: string;
}

/** Where the project's mocks file will be created, cleared for creating it. */
export interface CreatedMocksTarget {
  kind: "create";
  /** The file's path in the project root. */
  path: string;
  /** The path relative to the project root, with `/` separators. */
  relative: string;
  /** The file's name. */
  name: string;
  /** The name of the project's `courier.config.*`. */
  configName: string;
}

/** The file an edit adding mocks writes: the existing mocks file, or a new one. */
export type MocksTarget = ExistingMocksTarget | CreatedMocksTarget;

/**
 * Find the file an edit adding mocks would write, and check Studio may: the
 * project's `courier.mocks.*` when it has one, else the one Studio would
 * create beside `courier.config.*`. Either way, the file's import of the
 * config must reach the config Studio loads.
 *
 * @param projectRoot - The directory Studio found `courier.config.*` in
 * @returns The file to edit, read, or the file to create
 * @throws {MocksEditRefusal} When there is no config, or Studio will not write the file, saying why
 * @example
 * ```ts
 * const target = inspectMocksTarget(ctx.projectRoot);
 * const baseHash = target.kind === "existing" ? target.hash : null;
 * ```
 */
export function inspectMocksTarget(projectRoot: string): MocksTarget {
  const root = realpathSync(projectRoot);
  const config = findConfigFileAt(root);
  if (config === null) {
    throw new MocksEditRefusal(
      "NO_CONFIG",
      "There is no courier.config in the project root. Declare your sources there first.",
    );
  }
  const configName = basename(config);
  const mocks = findMocksFile(root);
  if (mocks === null) return inspectCreatedMocks(root, config);
  return inspectExistingMocks(root, mocks, configName);
}

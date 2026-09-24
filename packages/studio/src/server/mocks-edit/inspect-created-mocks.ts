import { lstatSync } from "node:fs";
import { basename, join } from "node:path";
import { MOCKS_BASENAMES } from "@noverax/courier-studio-core/config";
import { checkWriteAccess } from "./check-write-access";
import type { CreatedMocksTarget } from "./inspect-mocks-target";
import { MocksEditRefusal } from "./mocks-edit-refusal";
import { mocksFileNameFor } from "./mocks-file-name";

/**
 * Check Studio may create the project's mocks file, and name it:
 * `courier.mocks.mts` beside a `courier.config.mts`, `courier.mocks.ts`
 * beside any other config.
 *
 * @param root - The project root, symlinks resolved
 * @param config - The project's `courier.config.*`
 * @returns Where the file goes
 * @throws {MocksEditRefusal} When a mocks file is there after all, or Studio may not create one
 * @example
 * ```ts
 * const target = inspectCreatedMocks(root, join(root, "courier.config.ts"));
 * // target.name === "courier.mocks.ts"
 * ```
 */
export function inspectCreatedMocks(root: string, config: string): CreatedMocksTarget {
  for (const candidate of MOCKS_BASENAMES) checkAbsent(root, candidate);
  const configName = basename(config);
  checkOwnsProject(config, configName);
  const name = mocksFileNameFor(configName);
  checkWriteAccess(root, "the project directory", `Studio would create ${name} there.`);
  return { kind: "create", path: join(root, name), relative: name, name, configName };
}

/* Studio loads the first of these names present, so a file under any of
   them would be read instead of, or beside, the one Studio creates. */
function checkAbsent(root: string, candidate: string): void {
  const stat = lstatSync(join(root, candidate), { throwIfNoEntry: false });
  if (stat === undefined) return;
  if (stat.isSymbolicLink()) {
    throw new MocksEditRefusal(
      "MOCKS_IS_LINK",
      `${candidate} is a symbolic link. Studio edits and creates only a regular mocks file, so it leaves the link to you.`,
    );
  }
  if (!stat.isFile()) {
    const kind = stat.isDirectory() ? "a directory" : "not a regular file";
    throw new MocksEditRefusal(
      "MOCKS_NOT_REGULAR",
      `${candidate} is ${kind}, so Studio cannot create or edit a mocks file there.`,
    );
  }
  throw new MocksEditRefusal(
    "MOCKS_CHANGED_SINCE_LOAD",
    `${candidate} appeared while Studio was looking for the mocks file. Studio plans the edit once it has loaded it.`,
  );
}

/* A created file belongs to whoever creates it; one owned by another user
   than the project's would be a file its owner may not be able to change. */
function checkOwnsProject(config: string, configName: string): void {
  const uid = process.getuid?.();
  if (uid === undefined) return;
  const owner = lstatSync(config).uid;
  if (owner === uid) return;
  throw new MocksEditRefusal(
    "MOCKS_NOT_OWNED",
    `${configName} belongs to user ${owner}, but Studio runs as user ${uid}. A mocks file Studio created would belong to user ${uid}, so Studio leaves creating it to the project's owner.`,
  );
}

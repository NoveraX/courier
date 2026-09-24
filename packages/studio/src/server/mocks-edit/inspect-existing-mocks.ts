import { existsSync, lstatSync, readdirSync, type Stats } from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";
import { sha256Hex } from "../file-hash";
import { checkWriteAccess } from "./check-write-access";
import type { ExistingMocksTarget } from "./inspect-mocks-target";
import { MocksEditRefusal } from "./mocks-edit-refusal";
import { readMocksText } from "./read-mocks-text";
import { MOCKS_TEMP_NAME } from "./write-temp-beside";

/** 1 MiB: far past any mocks file written by hand. */
const MAX_BYTES = 1024 * 1024;
const JAVASCRIPT_EXTENSIONS: ReadonlySet<string> = new Set([".js", ".mjs", ".cjs"]);

/**
 * Check Studio may edit the project's existing mocks file, and read it.
 *
 * Studio saves an edit by replacing the file, so a file that replacing would
 * change in some other way — a link, a file with other names, one owned by
 * another user — is refused, as is one too large or in a language it cannot
 * reload after an edit.
 *
 * @param root - The project root, symlinks resolved
 * @param path - The mocks file as found in the root
 * @param configName - The name of the project's `courier.config.*`
 * @returns The file, its bytes, text, hash and mode
 * @throws {MocksEditRefusal} When Studio will not edit the file, saying why
 * @example
 * ```ts
 * const target = inspectExistingMocks(root, join(root, "courier.mocks.ts"), "courier.config.ts");
 * ```
 */
export function inspectExistingMocks(
  root: string,
  path: string,
  configName: string,
): ExistingMocksTarget {
  const name = relative(root, path).split(sep).join("/");
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat === undefined) throw goneWhileInspecting(name);
  checkEditable(stat, root, path, name);
  const { bytes, text, mode } = readMocksText(path, stat, name);
  return {
    kind: "existing",
    path,
    relative: name,
    name: basename(path),
    bytes,
    text,
    hash: sha256Hex(bytes),
    mode,
    configName,
  };
}

function checkEditable(stat: Stats, root: string, path: string, name: string): void {
  checkRegularFile(stat, path, name);
  checkSingleName(stat, root, name);
  checkOwner(stat, name);
  checkWriteAccess(path, name, "Studio does not edit a file that is read-only to it.");
  checkWriteAccess(
    root,
    "the project directory",
    `Studio saves an edit to ${name} by writing a new file there and renaming it over the old one.`,
  );
  checkSize(stat, name);
  checkNotJavaScript(path, name);
}

function goneWhileInspecting(name: string): MocksEditRefusal {
  return new MocksEditRefusal(
    "MOCKS_CHANGED_SINCE_LOAD",
    `${name} was removed while Studio was looking at it. Studio plans the edit once it has reloaded.`,
  );
}

function checkRegularFile(stat: Stats, path: string, name: string): void {
  if (stat.isSymbolicLink()) {
    const reason = existsSync(path)
      ? "Studio saves an edit by replacing the file, which would replace the link with a copy"
      : "It points to a file that does not exist";
    throw new MocksEditRefusal(
      "MOCKS_IS_LINK",
      `${name} is a symbolic link. ${reason}, so Studio edits only a regular file.`,
    );
  }
  if (stat.isFile()) return;
  const kind = stat.isDirectory() ? "a directory" : "not a regular file";
  throw new MocksEditRefusal(
    "MOCKS_NOT_REGULAR",
    `${name} is ${kind}, so Studio cannot edit it as a mocks file.`,
  );
}

function checkSingleName(stat: Stats, root: string, name: string): void {
  if (stat.nlink <= 1) return;
  const leftover = leftoverTempOf(stat, root);
  const hint =
    leftover === null
      ? ""
      : ` One of them is ${leftover}, most likely left behind when Studio created the file; delete it and ask again.`;
  throw new MocksEditRefusal(
    "MOCKS_HARD_LINKED",
    `${name} has ${stat.nlink} hard links. Studio saves an edit by replacing the file, which would part it from its other names, so it leaves the file to you.${hint}`,
  );
}

/* A creation whose temporary file could not be removed leaves it as a
   second name of the new file, which is what the hard-link check sees. */
function leftoverTempOf(stat: Stats, root: string): string | null {
  for (const entry of readdirSync(root)) {
    if (!MOCKS_TEMP_NAME.test(entry)) continue;
    const other = lstatSync(join(root, entry), { throwIfNoEntry: false });
    if (other?.ino === stat.ino && other.dev === stat.dev) return entry;
  }
  return null;
}

/* The replacing file belongs to whoever writes it. Root is refused too rather
   than handing the file back with chown: Studio never changes who owns it. */
function checkOwner(stat: Stats, name: string): void {
  const uid = process.getuid?.();
  if (uid === undefined || stat.uid === uid) return;
  throw new MocksEditRefusal(
    "MOCKS_NOT_OWNED",
    `${name} belongs to user ${stat.uid}, but Studio runs as user ${uid}. An edited file would belong to user ${uid}, so Studio leaves it to its owner.`,
  );
}

function checkSize(stat: Stats, name: string): void {
  if (stat.size <= MAX_BYTES) return;
  throw new MocksEditRefusal(
    "MOCKS_TOO_LARGE",
    `${name} is ${stat.size} bytes, more than the ${MAX_BYTES} bytes (1 MiB) Studio edits.`,
  );
}

function checkNotJavaScript(path: string, name: string): void {
  if (!JAVASCRIPT_EXTENSIONS.has(extname(path))) return;
  throw new MocksEditRefusal(
    "MOCKS_JAVASCRIPT",
    `${name} is JavaScript. Studio cannot reload a JavaScript mocks file after an edit, so it will not edit one.`,
  );
}

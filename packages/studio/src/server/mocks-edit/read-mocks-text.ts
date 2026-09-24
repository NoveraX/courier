import type { Stats } from "node:fs";
import { NotRegularFileError } from "../not-regular-file-error";
import { type RegularFile, readRegularFile } from "../read-regular-file";
import { MocksEditRefusal } from "./mocks-edit-refusal";

const GENERATED_MARKER = /@generated|DO NOT EDIT/;
const HEADER_LINES = 5;
const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** A mocks file as read for an edit. */
export interface MocksText {
  /** The file as it is on disk. */
  bytes: Buffer;
  /** The bytes decoded as UTF-8, a byte-order mark kept. */
  text: string;
  /** Its permission bits. */
  mode: number;
}

/**
 * Read the mocks file the checks approved, as text Studio can edit.
 *
 * It is read through a descriptor of that very file, so the bytes, text and
 * mode all describe one file even if its name is swapped meanwhile. Text that
 * is not UTF-8 is refused rather than decoded lossily, and so is a file whose
 * header marks it as generated.
 *
 * @param path - The mocks file
 * @param approved - Its `lstat`, which the checks approved
 * @param name - The file relative to the project root, for messages
 * @returns Its bytes, text and mode
 * @throws {MocksEditRefusal} `MOCKS_CHANGED_SINCE_LOAD`, `NOT_UTF8` or `MOCKS_GENERATED`
 * @example
 * ```ts
 * const { bytes, text, mode } = readMocksText(path, lstatSync(path), "courier.mocks.ts");
 * ```
 */
export function readMocksText(path: string, approved: Stats, name: string): MocksText {
  const { bytes, stats } = readApproved(path, approved, name);
  const text = decodeUtf8(bytes, name);
  checkNotGenerated(text, name);
  return { bytes, text, mode: stats.mode & 0o7777 };
}

/* Read without following a link and without blocking, so a link or a FIFO
   swapped in after the checks is refused rather than read through or waited
   on; and read through one descriptor whose inode must be the approved one. */
function readApproved(path: string, approved: Stats, name: string): RegularFile {
  let file: RegularFile | null;
  try {
    file = readRegularFile(path);
  } catch (error) {
    if (error instanceof NotRegularFileError) throw changedWhileReading(name, error);
    throw error;
  }
  if (file === null) throw changedWhileReading(name);
  const { ino, dev } = file.stats;
  if (ino !== approved.ino || dev !== approved.dev) throw changedWhileReading(name);
  return file;
}

function changedWhileReading(name: string, cause?: unknown): MocksEditRefusal {
  return new MocksEditRefusal(
    "MOCKS_CHANGED_SINCE_LOAD",
    `${name} changed while Studio was reading it. Studio plans the edit once it has reloaded the file.`,
    { cause },
  );
}

function decodeUtf8(bytes: Buffer, name: string): string {
  try {
    return UTF8.decode(bytes);
  } catch (error) {
    throw new MocksEditRefusal(
      "NOT_UTF8",
      `${name} is not valid UTF-8 text. Studio edits only text it can read in full, so it leaves this file as it is.`,
      { cause: error },
    );
  }
}

function checkNotGenerated(text: string, name: string): void {
  const index = text.split("\n", HEADER_LINES).findIndex((line) => GENERATED_MARKER.test(line));
  if (index === -1) return;
  throw new MocksEditRefusal(
    "MOCKS_GENERATED",
    `Line ${index + 1} of ${name} marks the file as generated, so an edit would be lost when it is generated again. Change what generates it instead.`,
  );
}

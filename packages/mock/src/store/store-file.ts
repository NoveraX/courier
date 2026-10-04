import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** The format a store file is written in; a file in another one is not read. */
const STORE_FILE_VERSION = 1;

/** What a store file holds: each collection's records, by name. */
export type StoredCollections = Record<string, Record<string, unknown>[]>;

/** A store file that is there but cannot be read as one. */
export class StoreFileError extends Error {
  constructor(file: string, reason: string) {
    super(`${file} is not a store file Courier can read: ${reason}`);
    this.name = "StoreFileError";
  }
}

/**
 * Read the collections a store file holds.
 *
 * @param file - The file's path
 * @returns The collections, or `null` when there is no file yet
 * @throws {StoreFileError} When the file is there but not JSON in the store
 *   file's format: an object with `version: 1` and `collections`, an object
 *   whose every value is a list of records
 * @example
 * ```ts
 * readStoreFile(".courier/mocks/users.json"); // → { users: [{ id: 1, name: "Ada" }] }
 * ```
 */
export function readStoreFile(file: string): StoredCollections | null {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  return storedCollections(file, parsed(file, text));
}

/**
 * The text a store file holds for these collections: what decides whether
 * anything changed since the last write.
 *
 * @param collections - Each collection's records, by name
 * @returns The file's text
 * @example
 * ```ts
 * storeFileText({ users: [] }); // → '{\n  "version": 1,\n  "collections": {\n    "users": []\n  }\n}\n'
 * ```
 */
export function storeFileText(collections: StoredCollections): string {
  return `${JSON.stringify({ version: STORE_FILE_VERSION, collections }, null, 2)}\n`;
}

/**
 * Write a store file's text, replacing the file whole.
 *
 * @param file - The file's path; its folder is created when missing
 * @param text - The text, as `storeFileText` gives it
 * @returns Once the file holds it
 * @example
 * ```ts
 * await writeStoreText(file, storeFileText(store.snapshot()));
 * ```
 */
export async function writeStoreText(file: string, text: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const beside = `${file}.${process.pid}.tmp`;
  await writeFile(beside, text, "utf8");
  await rename(beside, file);
}

function parsed(file: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) throw new StoreFileError(file, error.message);
    throw error;
  }
}

function storedCollections(file: string, content: unknown): StoredCollections {
  if (!isRecord(content) || content.version !== STORE_FILE_VERSION) {
    throw new StoreFileError(file, `it has no "version": ${STORE_FILE_VERSION}`);
  }
  const { collections } = content;
  if (!isRecord(collections)) throw new StoreFileError(file, `"collections" is not an object`);
  const read: StoredCollections = {};
  for (const [name, records] of Object.entries(collections)) {
    if (!isList(records) || !records.every(isRecord)) {
      throw new StoreFileError(file, `"collections.${name}" is not a list of records`);
    }
    read[name] = records;
  }
  return read;
}

function isList(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import { join } from "node:path";
import { createLogger } from "@noverax/courier";
import { ensureCourierSubdir } from "./courier-dir";
import { CourierDirUnsafeError } from "./courier-dir-unsafe-error";
import { sha256Hex } from "./sha256-hex";

const log = createLogger("Studio");

/* The folder in `.courier/` that holds each managed mock's store. */
const MOCK_STORES = "mocks";

/* A key longer than this is cut in the file's name; its hash still tells it apart. */
const READABLE_LENGTH = 64;

/**
 * The file a managed mock keeps its store in, so its records survive a
 * restart of the mock or of Studio: `.courier/mocks/<key>-<hash>.sqlite`, an
 * SQLite database whose schema the mock keeps itself.
 *
 * The key is written with letters, digits, `-` and `_` only — any other
 * character becomes `_` — and the hash of the whole key keeps two keys that
 * read alike apart. Studio keeps no file, and says so, when `.courier` or its
 * `mocks` folder is a link or not a folder: it writes nothing through one.
 *
 * @param projectRoot - The project Studio serves
 * @param mockKey - The mock's key in `courier.mocks.ts`
 * @returns The file's path, or `null` when Studio keeps none
 * @example
 * ```ts
 * mockStoreFile(root, "usersMock"); // → "<root>/.courier/mocks/usersMock-1a2b3c4d.sqlite"
 * ```
 */
export function mockStoreFile(projectRoot: string, mockKey: string): string | null {
  let folder: string;
  try {
    folder = ensureCourierSubdir(projectRoot, MOCK_STORES);
  } catch (error) {
    if (!(error instanceof CourierDirUnsafeError)) throw error;
    log.warn(`${mockKey} starts from its seeds: ${error.message}`);
    return null;
  }
  const readable = mockKey.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, READABLE_LENGTH);
  return join(folder, `${readable}-${sha256Hex(mockKey).slice(0, 8)}.sqlite`);
}

import type { FileHandle } from "node:fs/promises";

import { createLogger } from "../../logger";
import { BodyError } from "../body-error";
import type { NodeDisk } from "./node-disk";

const log = createLogger("Proxy");

/* Why a folder for an upload could not be made: no such place, or not this process's to write. */
const NO_FOLDER: ReadonlySet<unknown> = new Set(["EACCES", "EPERM", "EROFS", "ENOENT", "ENOTDIR"]);
/* A disk, or this user's share of it, that is full. */
const FULL: ReadonlySet<unknown> = new Set(["ENOSPC", "EDQUOT"]);
/* Every folder still on disk, for the process's exit to remove. */
const LIVE = new Set<string>();
let removedAtExit = false;
let toldNoFolder = false;

/** One file of an upload being written to its folder. */
export interface SpoolFile {
  /** Write the next piece; resolves once it is on disk. */
  write(piece: Uint8Array<ArrayBuffer>): Promise<void>;
  /** Close the file and hand it back, read from where it is as it is read. */
  file(name: string, type: string | undefined): Promise<File>;
  /** Close the file, which its folder's removal takes with it. */
  abandon(): Promise<void>;
}

/**
 * The folder an upload's files are written to while its call runs: made
 * when the first file needs it, with a name no one can guess, readable by
 * this process's user alone, each file in it written once, under a number
 * rather than the name a client sent, and the whole of it removed once the
 * call is done — or when the process exits, for one left behind.
 *
 * Windows lets a file go only once every reader has closed it: an upstream
 * still reading a file as the call ends holds it a moment longer, and the
 * removal is tried again then.
 */
export class Spool {
  readonly #disk: NodeDisk;
  readonly #parent: string;
  #folder: string | undefined;
  #count = 0;

  constructor(disk: NodeDisk, parent: string) {
    this.#disk = disk;
    this.#parent = parent;
  }

  /**
   * A new file in the folder, open for writing.
   *
   * @returns The file, or `undefined` when no folder can be made where the
   *   upload's files were to go, which is said once in the log
   * @throws BodyError `UPLOAD_STORAGE_FULL` when the disk is full
   */
  async create(): Promise<SpoolFile | undefined> {
    const { fs, path } = this.#disk;
    try {
      this.#folder ??= await fs.promises.mkdtemp(path.join(this.#parent, "courier-upload-"));
    } catch (error) {
      if (!NO_FOLDER.has(codeOf(error))) throw stored(error);
      tellNoFolder(this.#parent, error);
      return undefined;
    }
    LIVE.add(this.#folder);
    removeAtExit(this.#disk);
    const file = path.join(this.#folder, String(this.#count++));
    const handle = await fs.promises.open(file, "wx", 0o600).catch((error: unknown) => {
      throw stored(error);
    });
    return written(this.#disk, file, handle);
  }

  /** Remove the folder and every file in it, if one was made. */
  async remove(): Promise<void> {
    const folder = this.#folder;
    this.#folder = undefined;
    if (folder === undefined) return;
    try {
      await this.#disk.fs.promises.rm(folder, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
      LIVE.delete(folder);
    } catch (error) {
      log.warn(
        `An upload's files at ${folder} could not be removed (${String(codeOf(error))}); the process removes them as it exits`,
      );
    }
  }
}

function written(disk: NodeDisk, path: string, handle: FileHandle): SpoolFile {
  let open = true;
  const close = async (): Promise<void> => {
    if (!open) return;
    open = false;
    await handle.close();
  };
  return {
    async write(piece) {
      try {
        for (let at = 0; at < piece.byteLength; ) {
          at += (await handle.write(piece, at, piece.byteLength - at)).bytesWritten;
        }
      } catch (error) {
        throw stored(error);
      }
    },
    async file(name, type) {
      await close();
      const blob = await disk.fs.openAsBlob(path);
      return new File([blob], name, { type: type ?? "text/plain" });
    },
    abandon: close,
  };
}

/* A full disk refuses the upload; any other failure is the server's own. */
function stored(error: unknown): unknown {
  if (!FULL.has(codeOf(error))) return error;
  return new BodyError("UPLOAD_STORAGE_FULL", "The server has no room left to keep the upload", {
    cause: error,
  });
}

function tellNoFolder(parent: string, error: unknown): void {
  if (toldNoFolder) return;
  toldNoFolder = true;
  log.warn(
    `Uploads cannot be kept in ${parent} (${String(codeOf(error))}), so they are held in memory: ` +
      'point uploadDirectory at a folder this process can write, or set uploadMode to "memory"',
  );
}

/* Once per process: the folders still there when it exits go with it. */
function removeAtExit(disk: NodeDisk): void {
  if (removedAtExit) return;
  removedAtExit = true;
  process.once("exit", () => {
    for (const folder of LIVE) {
      try {
        disk.fs.rmSync(folder, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 });
      } catch (error) {
        log.warn(`An upload's files at ${folder} could not be removed (${String(codeOf(error))})`);
      }
    }
  });
}

function codeOf(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}

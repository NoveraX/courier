import { LIMITS } from "../limits";
import type { FileStore } from "./file-store";
import { GatheredFile } from "./gathered-file";
import type { MultipartPart } from "./multipart-parts";
import type { NodeDisk } from "./node-disk";
import { Spool, type SpoolFile } from "./spool";
import { UploadHold } from "./upload-hold";

/** Where and how much of an upload is kept. */
export interface DiskStoreOptions {
  /** Node's file system */
  disk: NodeDisk;
  /** The folder each upload's own folder is made in */
  directory: string;
  /** How many bytes of one upload's files are kept in memory before the rest go to disk */
  memoryBytes: number;
  /** The size of a file's first slab in memory */
  slabBytes: number;
  /** How old a folder a gone process left must be for it to be removed; the body's timeout unless given */
  staleAfterMs?: number | undefined;
  /** The upload's part of what every upload of the process keeps; nothing bounds it unless given */
  hold?: UploadHold | undefined;
}

/* What a store given no hold keeps beside every other upload: as much as it takes. */
const UNBOUNDED = { memoryBytes: Number.POSITIVE_INFINITY, diskBytes: Number.POSITIVE_INFINITY };

/**
 * Keep an upload's files in memory up to `memoryBytes` for the whole of
 * it, and on disk past that.
 *
 * A file starts in memory; one that takes the upload past its share goes
 * to disk as it arrives, what it had gathered first with it, and a later
 * file that fits in what is left of the share stays in memory. On disk, each
 * piece is written before the next is read, so a slow disk slows the upload
 * rather than filling memory, and the call gets a `File` read from disk as
 * it is read. Where no folder can be made the upload stays in memory, as it
 * would without a disk. Each piece is taken from the room every upload of
 * the process shares, given the upload's hold: a file goes to disk once that
 * room in memory is taken too, and an upload with room left neither there
 * nor on disk is refused.
 *
 * @param options - The file system, the folder, the share kept in memory, and the upload's hold
 * @returns The store; its `release` removes the upload's folder and gives its room back
 * @throws BodyError `UPLOAD_CAPACITY_REACHED`, from `file`, when there is no room left
 *
 * @example
 * ```ts
 * const store = diskStore({ disk, directory: disk.os.tmpdir(), memoryBytes: 1_048_576, slabBytes: 65_536 });
 * try { form = await readForm(body, boundary, limits, store) } finally { await store.release() }
 * ```
 */
export function diskStore(options: DiskStoreOptions): FileStore {
  const spool = new Spool(
    options.disk,
    options.directory,
    options.staleAfterMs ?? LIMITS.BODY_TIMEOUT_MS,
  );
  const hold = options.hold ?? new UploadHold(UNBOUNDED);
  let inMemory = 0;
  let toDisk = true;

  /* Whether a piece stays in memory: within the upload's share, and the room every upload shares. */
  const staysInMemory = (gathered: GatheredFile, bytes: number): boolean =>
    inMemory + gathered.size + bytes <= options.memoryBytes && hold.tryMemory(bytes);

  /* The file the room in memory runs out in, written to disk from its start; undefined without one. */
  const spill = async (gathered: GatheredFile): Promise<SpoolFile | undefined> => {
    const file = await spool.create();
    if (file === undefined) {
      toDisk = false;
      return undefined;
    }
    try {
      hold.disk(gathered.size);
      for (const blob of gathered.blobs())
        await file.write(new Uint8Array(await blob.arrayBuffer()));
    } catch (error) {
      await file.abandon();
      throw error;
    }
    hold.freeMemory(gathered.size);
    return file;
  };

  return {
    async file(part: MultipartPart) {
      const gathered = new GatheredFile(options.slabBytes);
      let onDisk: SpoolFile | undefined;
      try {
        for await (const piece of part.body) {
          const bytes = piece.byteLength;
          if (onDisk === undefined && toDisk && !staysInMemory(gathered, bytes)) {
            onDisk = await spill(gathered);
          }
          if (onDisk !== undefined) {
            hold.disk(bytes);
            await onDisk.write(piece);
            continue;
          }
          /* No disk to go to: memory, where there is room, or the upload is refused. */
          if (!toDisk) hold.memory(bytes);
          gathered.add(piece);
        }
      } catch (error) {
        await onDisk?.abandon();
        throw error;
      }
      if (onDisk !== undefined) return onDisk.file(part.filename ?? "", part.type);
      inMemory += gathered.size;
      return gathered.file(part.filename ?? "", part.type);
    },
    release: async () => {
      await spool.remove();
      hold.release();
    },
  };
}

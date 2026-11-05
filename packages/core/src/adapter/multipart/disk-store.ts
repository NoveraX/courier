import type { FileStore } from "./file-store";
import { GatheredFile } from "./gathered-file";
import type { MultipartPart } from "./multipart-parts";
import type { NodeDisk } from "./node-disk";
import { Spool, type SpoolFile } from "./spool";

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
}

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
 * would without a disk.
 *
 * @param options - The file system, the folder, and the share kept in memory
 * @returns The store; its `release` removes the upload's folder
 *
 * @example
 * ```ts
 * const store = diskStore({ disk, directory: disk.os.tmpdir(), memoryBytes: 1_048_576, slabBytes: 65_536 });
 * try { form = await readForm(body, boundary, limits, store) } finally { await store.release() }
 * ```
 */
export function diskStore(options: DiskStoreOptions): FileStore {
  const spool = new Spool(options.disk, options.directory);
  let inMemory = 0;
  let toDisk = true;

  /* The file the upload's share runs out in, written to disk from its start; undefined without one. */
  const spill = async (gathered: GatheredFile): Promise<SpoolFile | undefined> => {
    const file = await spool.create();
    if (file === undefined) {
      toDisk = false;
      return undefined;
    }
    for (const blob of gathered.blobs()) await file.write(new Uint8Array(await blob.arrayBuffer()));
    return file;
  };

  return {
    async file(part: MultipartPart) {
      const gathered = new GatheredFile(options.slabBytes);
      let onDisk: SpoolFile | undefined;
      try {
        for await (const piece of part.body) {
          if (onDisk !== undefined) {
            await onDisk.write(piece);
            continue;
          }
          if (toDisk && inMemory + gathered.size + piece.byteLength > options.memoryBytes) {
            onDisk = await spill(gathered);
            if (onDisk !== undefined) {
              await onDisk.write(piece);
              continue;
            }
          }
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
    release: () => spool.remove(),
  };
}

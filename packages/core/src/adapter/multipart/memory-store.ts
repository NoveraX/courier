import type { FileStore } from "./file-store";
import { GatheredFile } from "./gathered-file";
import type { UploadHold } from "./upload-hold";

/**
 * Keep each uploaded file in memory, as one copy of its bytes gathered as
 * they arrive (see `GatheredFile`). Given the upload's hold, each piece is
 * taken from the room every upload of the process shares in memory, and an
 * upload there is no room for is refused.
 *
 * @param slabBytes - The size of a file's first slab
 * @param hold - The upload's part of what every upload keeps, for the proxy's uploads
 * @returns The store, which holds nothing beyond the files it hands out
 * @throws BodyError `UPLOAD_CAPACITY_REACHED`, from `file`, when there is no room left
 *
 * @example
 * ```ts
 * const form = await readForm(parts, limits, memoryStore(65_536));
 * ```
 */
export function memoryStore(slabBytes: number, hold?: UploadHold): FileStore {
  return {
    async file(part) {
      const gathered = new GatheredFile(slabBytes);
      for await (const piece of part.body) {
        hold?.memory(piece.byteLength);
        gathered.add(piece);
      }
      return gathered.file(part.filename ?? "", part.type);
    },
    release: () => {
      hold?.release();
      return Promise.resolve();
    },
  };
}

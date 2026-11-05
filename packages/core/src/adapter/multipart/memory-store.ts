import type { FileStore } from "./file-store";
import { GatheredFile } from "./gathered-file";

/**
 * Keep each uploaded file in memory, as one copy of its bytes gathered as
 * they arrive (see `GatheredFile`).
 *
 * @param slabBytes - The size of a file's first slab
 * @returns The store, which holds nothing beyond the files it hands out
 *
 * @example
 * ```ts
 * const form = await readForm(parts, limits, memoryStore(65_536));
 * ```
 */
export function memoryStore(slabBytes: number): FileStore {
  return {
    async file(part) {
      const gathered = new GatheredFile(slabBytes);
      for await (const piece of part.body) gathered.add(piece);
      return gathered.file(part.filename ?? "", part.type);
    },
    release: () => Promise.resolve(),
  };
}

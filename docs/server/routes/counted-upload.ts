import type { StorageEngine } from "multer"

/**
 * Where the upload example's file goes: nowhere. The example answers with
 * the file's name, type and size alone, so its bytes are counted as they
 * stream in and let go, and an upload costs the backend a chunk of memory
 * at a time, however large the file it carries.
 *
 * @returns The storage, for multer
 * @example
 * ```ts
 * multer({ storage: countedUpload(), limits: { fileSize: 1024 * 1024 } })
 * ```
 */
export function countedUpload(): StorageEngine {
  return {
    _handleFile(_req, file, done) {
      let size = 0
      file.stream.on("data", (chunk: Buffer) => {
        size += chunk.length
      })
      file.stream.once("error", done)
      file.stream.once("end", () => done(null, { size }))
    },
    _removeFile(_req, _file, done) {
      done(null)
    },
  }
}

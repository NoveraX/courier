import type { MultipartPart } from "./multipart-parts";

/**
 * Where an upload's files are kept while the call runs: in memory, or on
 * disk where the runtime has one. Either way each file reaches the call as
 * a `File`, which validation, middleware and a retry read as often as they
 * need.
 */
export interface FileStore {
  /**
   * Take a file part's bytes, read to their end, and hand back the file.
   *
   * @param part - A part with a filename
   * @returns The file, named and typed as the part was
   */
  file(part: MultipartPart): Promise<File>;

  /**
   * Let go of what the store keeps for the files it handed out: once the
   * call has run, or the upload was refused. A file read after it fails.
   */
  release(): Promise<void>;
}

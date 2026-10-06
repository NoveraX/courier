import { acceptsFile } from "./accepts-file";
import { sizeLabel } from "./size-label";
import type { UploadedFile } from "./uploaded-files";

/** Why the mock refuses an upload, as a server with limits answers it: 413 over the size it takes, 415 for a type it does not. */
export interface UploadRefusal {
  status: 413 | 415;
  error: string;
}

/**
 * The refusal of an upload over the largest the mock takes.
 *
 * @param size - The upload's size in bytes, when its request declared it
 * @param limit - The largest upload taken, in bytes
 * @returns The 413 and why
 * @example
 * ```ts
 * oversizeRefusal(3_355_443, 1_048_576);
 * // { status: 413, error: "The upload is 3.2 MB, over the 1 MB the mock takes" }
 * ```
 */
export function oversizeRefusal(size: number | undefined, limit: number): UploadRefusal {
  const over = `over the ${sizeLabel(limit)} the mock takes`;
  return {
    status: 413,
    error:
      size === undefined ? `The upload is ${over}` : `The upload is ${sizeLabel(size)}, ${over}`,
  };
}

function named(file: UploadedFile): string {
  const type = file.type === "" ? "no type" : file.type;
  return file.name === "" ? `An upload of ${type}` : `${file.name} (${type})`;
}

/**
 * The refusal of an upload holding a file of a type the mock does not take,
 * naming the first such file and the types it takes.
 *
 * @param files - The files the upload holds
 * @param accept - The types taken; an empty list takes any
 * @returns The 415 and why, or `undefined` when every file is taken
 * @example
 * ```ts
 * typeRefusal([{ name: "a.heic", type: "image/heic", size: 9 }], ["image/png"]);
 * // { status: 415, error: "a.heic (image/heic) is not a type the mock takes: image/png" }
 * ```
 */
export function typeRefusal(
  files: readonly UploadedFile[],
  accept: readonly string[],
): UploadRefusal | undefined {
  const refused = files.find((file) => !acceptsFile(accept, file));
  if (refused === undefined) return undefined;
  return {
    status: 415,
    error: `${named(refused)} is not a type the mock takes: ${accept.join(", ")}`,
  };
}

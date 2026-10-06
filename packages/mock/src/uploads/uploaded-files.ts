/** A file an upload carries, as a server sees it: its name, its type and its size in bytes. */
export interface UploadedFile {
  name: string;
  type: string;
  size: number;
}

/**
 * The files a body carries: each file a form holds, in order, or a body of
 * raw bytes as one file with no name.
 *
 * @param body - The form, or the raw body
 * @returns Its files
 * @example
 * ```ts
 * uploadedFiles(form); // [{ name: "q3.pdf", type: "application/pdf", size: 18_204 }]
 * ```
 */
export function uploadedFiles(body: FormData | Blob): UploadedFile[] {
  if (body instanceof Blob) return [{ name: "", type: body.type, size: body.size }];
  const files: UploadedFile[] = [];
  for (const value of body.values()) {
    if (value instanceof Blob) {
      const name = value instanceof File ? value.name : "";
      files.push({ name, type: value.type, size: value.size });
    }
  }
  return files;
}

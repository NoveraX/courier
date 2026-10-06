import type { UploadedFile } from "./uploaded-files";

/* A type without its parameters, as `type/subtype`, in lower case. */
function essence(type: string): string {
  return (type.split(";")[0] ?? "").trim().toLowerCase();
}

function takes(entry: string, file: Pick<UploadedFile, "name" | "type">): boolean {
  const wanted = entry.trim().toLowerCase();
  if (wanted === "*" || wanted === "*/*") return true;
  if (wanted.startsWith(".")) return file.name.toLowerCase().endsWith(wanted);
  const type = essence(file.type);
  if (wanted.endsWith("/*")) return type.startsWith(wanted.slice(0, -1));
  return type === wanted;
}

/**
 * Whether a list of types takes a file, read as `<input accept>` reads it:
 * a type matches the file's own (`application/pdf`), a family its first
 * half (`image/*`), an extension the end of its name (`.csv`) — each
 * regardless of case. An empty list takes any file.
 *
 * @param accept - The types taken
 * @param file - The file's name and type
 * @returns Whether the file is one of them
 * @example
 * ```ts
 * acceptsFile(["image/*", ".pdf"], { name: "Q3.PDF", type: "" }); // true
 * acceptsFile(["image/*"], { name: "notes.txt", type: "text/plain" }); // false
 * ```
 */
export function acceptsFile(
  accept: readonly string[],
  file: Pick<UploadedFile, "name" | "type">,
): boolean {
  return accept.length === 0 || accept.some((entry) => takes(entry, file));
}

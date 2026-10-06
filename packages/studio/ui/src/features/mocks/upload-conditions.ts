import type { MockServerInfo, UploadConditions } from "@/store/mock-slice";

/** The upload speeds the Uploads card offers, in kilobits a second; 0 is unlimited. */
export const UPLOAD_SPEEDS: readonly number[] = [0, 512, 1_500, 10_000];

/** The size limits the cards offer, in bytes; 0 is none. */
export const SIZE_LIMITS: readonly number[] = [0, 102_400, 1_048_576, 5_242_880];

/**
 * The upload conditions a mock holds: its upload speed, size limit and
 * types of file, each absent when it sets none.
 *
 * @param server - The mock server
 * @returns Its conditions
 * @example
 * ```ts
 * uploadsOf(server).maxBytes; // 1_048_576
 * ```
 */
export function uploadsOf(server: Pick<MockServerInfo, "networkConfig">): UploadConditions {
  return server.networkConfig?.uploads ?? {};
}

/**
 * A size as the mock says it in its refusals: in megabytes from one up, in
 * kilobytes below, to a tenth.
 *
 * @param bytes - The size in bytes
 * @returns Its label
 * @example
 * ```ts
 * sizeLimitLabel(102_400); // "100 KB"
 * sizeLimitLabel(5_242_880); // "5 MB"
 * ```
 */
export function sizeLimitLabel(bytes: number): string {
  return bytes >= 1_048_576
    ? `${Number((bytes / 1_048_576).toFixed(1))} MB`
    : `${Number((bytes / 1024).toFixed(1))} KB`;
}

/**
 * The types of file a list names, as the File types field shows them.
 *
 * @param accept - The types
 * @returns Them, comma-separated; `""` for none
 * @example
 * ```ts
 * typesText(["image/*", ".pdf"]); // "image/*, .pdf"
 * ```
 */
export function typesText(accept: readonly string[] | undefined): string {
  return (accept ?? []).join(", ");
}

/**
 * The types of file a File types field names: split at commas and spaces,
 * as `<input accept>` lists them, the blanks dropped.
 *
 * @param text - What was typed
 * @returns The types
 * @example
 * ```ts
 * typesOf("image/*, .pdf  .csv"); // ["image/*", ".pdf", ".csv"]
 * ```
 */
export function typesOf(text: string): string[] {
  return text.split(/[\s,]+/).filter((type) => type !== "");
}

/**
 * Whether a mock's uploads are under conditions of its own: a speed, a
 * size limit or a list of types.
 *
 * @param uploads - The conditions
 * @returns Whether any is set
 * @example
 * ```ts
 * limitsUploads({ accept: [] }); // false
 * ```
 */
export function limitsUploads(uploads: UploadConditions): boolean {
  return (
    (uploads.bandwidth ?? 0) > 0 || (uploads.maxBytes ?? 0) > 0 || (uploads.accept?.length ?? 0) > 0
  );
}

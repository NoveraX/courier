import { BodyError } from "../body-error";
import type { MultipartPart } from "./multipart-parts";

/** The field the proxy client writes before the caller's, holding the call's options. */
const OPTIONS_FIELD = "_options";

/**
 * Whether an upload's first part is the call's options: the field the
 * client writes them in, before the caller's own. A field of that name
 * anywhere else is the caller's.
 *
 * @param part - The upload's first part
 * @returns `true` for the options field
 * @throws BodyError `BODY_MALFORMED` for options sent as a file
 *
 * @example
 * ```ts
 * if (isOptionsPart(first)) options = await fields.read(first);
 * ```
 */
export function isOptionsPart(part: MultipartPart): boolean {
  if (part.name !== OPTIONS_FIELD) return false;
  if (part.filename !== undefined) {
    throw new BodyError("BODY_MALFORMED", "options must be a JSON string");
  }
  return true;
}

/**
 * The text fields of one upload, read as they arrive and held, together, to
 * a number of bytes: text is held as text, never on disk.
 *
 * @example
 * ```ts
 * const fields = new TextFields(1_048_576);
 * form.append(part.name, await fields.read(part));
 * ```
 */
export class TextFields {
  readonly #limit: number;
  #bytes = 0;

  /** @param limit - The most bytes the upload's text fields may take together */
  constructor(limit: number) {
    this.#limit = limit;
  }

  /**
   * Read a field as UTF-8, its byte order mark kept and a sequence that is
   * not UTF-8 replaced, as the platform's own parser reads one.
   *
   * @param part - The field
   * @returns Its text
   * @throws BodyError `UPLOAD_FIELDS_TOO_LARGE` once the upload's text
   *   passes the limit; the body's own refusal when it fails
   */
  async read(part: MultipartPart): Promise<string> {
    const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
    let text = "";
    for await (const piece of part.body) {
      this.#bytes += piece.byteLength;
      if (this.#bytes > this.#limit) {
        throw new BodyError(
          "UPLOAD_FIELDS_TOO_LARGE",
          `An upload's text fields exceed ${this.#limit} bytes`,
        );
      }
      text += decoder.decode(piece, { stream: true });
    }
    return text + decoder.decode();
  }
}

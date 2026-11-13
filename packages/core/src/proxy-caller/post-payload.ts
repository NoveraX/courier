import { isFieldRecord } from "../utils/body-kind";
import { isFormData } from "../utils/helpers";
import { holdsFile } from "../utils/variables-encoding";

/* Loaded with the first call that sends a record holding a file: a page that sends none never loads its encoding. */
let recordUploads: Promise<typeof import("../utils/record-upload")> | undefined;

/** The JSON body of a proxy POST: the call's variables and its options. */
export interface PostEnvelope {
  variables: unknown;
  options: Record<string, unknown>;
}

/** What a proxy POST sends: its body, and the content type of one its fetch does not type itself. */
export type PostPayload =
  | { body: FormData; json?: undefined; contentType?: undefined }
  | { body: Blob; json?: undefined; contentType: string }
  | { json: PostEnvelope; body?: undefined; contentType?: undefined };

/**
 * Whether a proxy call's variables are a record that holds a file, which it
 * sends as a record upload rather than as JSON.
 *
 * @param variables - The call's variables
 * @returns `true` for such a record
 * @example
 * ```ts
 * isRecordUpload({ title: "Dune", cover }); // → true
 * ```
 */
export function isRecordUpload(variables: unknown): variables is Record<string, unknown> {
  return isFieldRecord(variables) && holdsFile(variables);
}

/**
 * The body of a proxy POST: a JSON envelope, or the caller's form with the
 * call's options written before its fields. A record that holds a file goes
 * as a record upload instead, which {@link buildRecordUploadPayload} encodes.
 *
 * The endpoint is not in the body — it travels in the URL (see
 * `proxyRouting`). In a form, the server reads the first `_options` field as
 * the options, so a caller's own field of that name, later in the form,
 * reaches the upstream as the caller wrote it.
 *
 * @param variables - The caller's variables, or a form: not a record that holds a file
 * @param serverOptions - The options the server may act on
 * @returns The body to send
 *
 * @example
 * ```ts
 * buildPostPayload({ name: "Ada" }, {}); // → { json: { variables: { name: "Ada" }, options: {} } }
 * buildPostPayload(form, { timeout: 30_000 }); // → { body: FormData }
 * ```
 */
export function buildPostPayload(
  variables: unknown,
  serverOptions: Record<string, unknown>,
): PostPayload {
  if (!isFormData(variables)) return { json: { variables, options: serverOptions } };

  const body = new FormData();
  body.append("_options", JSON.stringify(serverOptions));
  for (const [key, value] of variables.entries()) {
    body.append(key, value);
  }
  return { body };
}

/**
 * The body of a proxy POST whose variables are a record that holds a file:
 * a record upload, which the server restores the record from. The encoding
 * loads with the first call that sends one; a call whose load failed fails
 * alone, and the next asks for it again.
 *
 * @param variables - A record that holds a file
 * @param serverOptions - The options the server may act on
 * @returns The body to send, and its content type
 * @throws ConfigurationError `VARIABLE_NOT_ENCODABLE` for a record value no form carries
 *
 * @example
 * ```ts
 * await buildRecordUploadPayload({ cover }, {}); // → { body: Blob, contentType: "multipart/vnd.courier.variables; …" }
 * ```
 */
export async function buildRecordUploadPayload(
  variables: Record<string, unknown>,
  serverOptions: Record<string, unknown>,
): Promise<PostPayload> {
  recordUploads ??= import("../utils/record-upload").catch((cause: unknown) => {
    recordUploads = undefined;
    throw cause;
  });
  return (await recordUploads).recordUpload(variables, serverOptions);
}

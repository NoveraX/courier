import { isFormData } from "../utils/helpers";

/** The JSON body of a proxy POST: the call's variables and its options. */
export interface PostEnvelope {
  variables: unknown;
  options: Record<string, unknown>;
}

/**
 * The body of a proxy POST: a JSON envelope, or the caller's form with the
 * call's options written before its fields.
 *
 * The endpoint is not in the body — it travels in the URL (see
 * `proxyRouting`). In a form, the server reads the first `_options` field as
 * the options, so a caller's own field of that name, later in the form,
 * reaches the upstream as the caller wrote it.
 *
 * @param variables - The caller's variables, or a form
 * @param serverOptions - The options the server may act on
 * @returns The body to send, as FormData or as the JSON envelope
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
): { body: FormData; json?: undefined } | { json: PostEnvelope; body?: undefined } {
  if (!isFormData(variables)) return { json: { variables, options: serverOptions } };

  const body = new FormData();
  body.append("_options", JSON.stringify(serverOptions));
  for (const [key, value] of variables.entries()) {
    body.append(key, value);
  }
  return { body };
}

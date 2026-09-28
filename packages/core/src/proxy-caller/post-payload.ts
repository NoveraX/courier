import { isFormData } from "../utils/helpers";
import type { RequestPayload } from "../utils/request-payload";

/**
 * The body of a proxy POST: a JSON envelope, or a multipart body that carries
 * the routing fields beside the caller's own.
 *
 * In a multipart body the routing fields come first, every one of them even
 * when empty, and the server reads the first field of each name as routing.
 * A caller's field may then share a name with one — a form sending
 * `_method=PUT`, as Laravel and Rails forms do — and still reach the upstream
 * as the caller wrote it.
 *
 * @param source - The source's registry name
 * @param group - The group, when the endpoint has one
 * @param method - The endpoint's name
 * @param variables - The caller's variables, or a form
 * @param serverOptions - The options the server may act on
 * @returns The body to send, as FormData or as the JSON envelope
 *
 * @example
 * ```ts
 * buildPostPayload("api", "files", "upload", form, {}); // → { body: FormData }
 * ```
 */
export function buildPostPayload(
  source: string,
  group: string | undefined,
  method: string,
  variables: unknown,
  serverOptions: Record<string, unknown>,
): { body: FormData; json?: undefined } | { json: Partial<RequestPayload>; body?: undefined } {
  if (isFormData(variables)) {
    const body = new FormData();
    body.append("_source", source);
    body.append("_group", group ?? "");
    body.append("_method", method);
    body.append("_options", JSON.stringify(serverOptions));

    for (const [key, value] of variables.entries()) {
      body.append(key, value);
    }

    return { body };
  }

  return {
    json: {
      source,
      group,
      method,
      variables,
      options: serverOptions,
    },
  };
}

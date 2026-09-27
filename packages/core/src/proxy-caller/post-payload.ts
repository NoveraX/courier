import { isFormData } from "../utils/helpers";
import type { RequestPayload } from "../utils/request-payload";

export function buildPostPayload(
  source: string,
  group: string | undefined,
  method: string,
  variables: unknown,
  serverOptions: Record<string, unknown>,
): { body: FormData; json?: undefined } | { json: Partial<RequestPayload>; body?: undefined } {
  if (isFormData(variables)) {
    const body = new FormData();

    for (const [key, value] of variables.entries()) {
      body.append(key, value);
    }

    body.append("_source", source);
    if (group) body.append("_group", group);
    body.append("_method", method);
    body.append("_options", JSON.stringify(serverOptions));

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

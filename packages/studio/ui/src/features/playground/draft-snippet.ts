import { withoutTrailingSlashes } from "@noverax/courier/internal";

import type { SnippetFlavor } from "@/features/requests/request-snippets";
import { requestSnippet } from "@/features/requests/request-snippets";
import { buildCurlSnippet, buildFetchSnippet } from "@/lib/snippets";
import type { PlaygroundEndpoint } from "./endpoint-choices";
import { snippetInput } from "./request-snippet";
import { requestUrlParts } from "./request-url";
import type { RequestValues } from "./request-values";

/**
 * The call the Playground is about to send, written out in a flavour —
 * cURL or websocat, fetch or the browser's EventSource and WebSocket, or
 * the Courier client — with the headers as typed.
 *
 * @param endpoint - The endpoint
 * @param values - The variables and headers the call sends
 * @param flavor - The flavour
 * @returns The code
 * @example
 * ```ts
 * draftSnippet(create, { variables: { sku: "A" }, headers: {} }, "shell"); // "curl -X POST 'https://…' …"
 * ```
 */
export function draftSnippet(
  endpoint: PlaygroundEndpoint,
  values: RequestValues,
  flavor: SnippetFlavor,
): string {
  if (endpoint.transport === "http" && flavor !== "courier") {
    const template = `${withoutTrailingSlashes(endpoint.entry.baseURL)}${endpoint.path}`;
    const input = snippetInput(template, endpoint.def, values);
    return flavor === "shell" ? buildCurlSnippet(input) : buildFetchSnippet(input);
  }
  const draft = {
    url: requestUrlParts(endpoint, values.variables)
      .map((part) => part.text)
      .join(""),
    source: endpoint.source,
    group: endpoint.group || undefined,
    method: endpoint.method,
    httpMethod: endpoint.httpMethod,
    transport: endpoint.transport === "http" ? undefined : endpoint.transport,
    requestHeaders: values.headers,
    variables: values.variables,
    streamEvents: undefined,
  };
  return requestSnippet(draft, flavor, { redact: false }).code;
}

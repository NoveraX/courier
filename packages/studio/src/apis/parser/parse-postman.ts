/**
 * Postman Collection parser.
 */

import { isSupportedMethod } from "./http-methods";
import type {
  ParsedEndpoint,
  ParsedGroup,
  ParsedSchema,
  ParsedSpec,
  SkippedOperation,
  SpecNode,
} from "./types";
import {
  convertPathParams,
  extractPostmanPath,
  findCommonPrefix,
  inferSchemaFromValue,
  toBindingName,
  toCamelCase,
} from "./utils";

export function parsePostman(collection: SpecNode): ParsedSpec {
  const title = collection.info?.name ?? "Postman Collection";
  const version = collection.info?.version ?? "1.0.0";

  const groups: ParsedGroup[] = [];
  const skipped: SkippedOperation[] = [];

  function processItems(items: SpecNode[], groupName: string) {
    const endpoints: ParsedEndpoint[] = [];

    for (const item of items) {
      if (item.item) {
        processItems(item.item, item.name ?? groupName);
        continue;
      }

      const request = item.request;
      if (!request) continue;

      const method = (request.method ?? "GET").toLowerCase();
      const url = typeof request.url === "string" ? request.url : (request.url?.raw ?? "");
      const path = extractPostmanPath(url);

      if (!isSupportedMethod(method)) {
        skipped.push({
          method: method.toUpperCase(),
          path,
          reason: `${method.toUpperCase()} has no counterpart in the endpoint builder`,
        });
        continue;
      }

      let requestBody: ParsedSchema | null = null;
      if (request.body?.mode === "raw" && request.body.raw) {
        try {
          const bodyObj = JSON.parse(request.body.raw);
          requestBody = inferSchemaFromValue("RequestBody", bodyObj);
        } catch {
          /* not JSON */
        }
      }

      endpoints.push({
        name: toCamelCase(item.name ?? `${method}${path}`),
        operationId: null,
        httpMethod: method,
        path: convertPathParams(path),
        fullPath: path,
        description: item.name ?? "",
        secured: false,
        requestBody,
        parameters: [],
        responseSchema: null,
        tags: [groupName],
      });
    }

    if (endpoints.length > 0) {
      const prefix = findCommonPrefix(endpoints.map((e) => e.fullPath));
      groups.push({
        name: toBindingName(groupName),
        description: "",
        prefix,
        endpoints: endpoints.map((e) => ({
          ...e,
          path: convertPathParams(e.fullPath.slice(prefix.length) || "/"),
        })),
      });
    }
  }

  processItems(collection.item ?? [], "default");

  return {
    title,
    version,
    description: "",
    baseURL: "/",
    format: "postman",
    groups,
    schemas: {},
    securitySchemes: [],
    skipped,
  };
}

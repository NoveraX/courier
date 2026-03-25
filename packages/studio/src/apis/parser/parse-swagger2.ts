/**
 * Swagger 2.0 specification parser.
 * Converts to OpenAPI 3.x-like structure, then delegates to parseOpenApi3.
 */

import { parseOpenApi3 } from "./parse-openapi3";
import type { ParsedSpec, SpecNode } from "./types";

export function parseSwagger2(spec: SpecNode): ParsedSpec {
  const converted: SpecNode = {
    openapi: "3.0.0",
    info: spec.info,
    servers: [{ url: spec.basePath ?? "/" }],
    paths: {},
    components: { schemas: spec.definitions ?? {} },
  };

  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    converted.paths[path] = {};
    for (const [method, operation] of Object.entries(methods as SpecNode)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;

      const op = { ...(operation as SpecNode) };

      // Convert body parameters to requestBody
      const bodyParam = op.parameters?.find((p: SpecNode) => p.in === "body");
      if (bodyParam) {
        op.requestBody = {
          content: {
            "application/json": {
              schema: bodyParam.schema,
            },
          },
        };
        op.parameters = op.parameters?.filter((p: SpecNode) => p.in !== "body");
      }

      // Convert responses (Swagger 2 has schema directly, not under content)
      if (op.responses) {
        for (const [code, response] of Object.entries(op.responses)) {
          const resp = response as SpecNode;
          if (resp.schema) {
            op.responses[code] = {
              description: resp.description,
              content: {
                "application/json": {
                  schema: resp.schema,
                },
              },
            };
          }
        }
      }

      converted.paths[path][method] = op;
    }
  }

  const result = parseOpenApi3(converted);
  result.format = "swagger2" as ParsedSpec["format"];
  return result;
}

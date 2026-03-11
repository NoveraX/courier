/**
 * Swagger 2.0 specification parser.
 * Converts to OpenAPI 3.x-like structure, then delegates to parseOpenApi3.
 */

import { parseOpenApi3 } from "./parse-openapi3";
import type { ParsedSpec } from "./types";

export function parseSwagger2(spec: any): ParsedSpec {
  const converted: any = {
    openapi: "3.0.0",
    info: spec.info,
    servers: [{ url: spec.basePath ?? "/" }],
    paths: {},
    components: { schemas: spec.definitions ?? {} },
  };

  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    converted.paths[path] = {};
    for (const [method, operation] of Object.entries(methods as any)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;

      const op = { ...(operation as any) };

      // Convert body parameters to requestBody
      const bodyParam = op.parameters?.find((p: any) => p.in === "body");
      if (bodyParam) {
        op.requestBody = {
          content: {
            "application/json": {
              schema: bodyParam.schema,
            },
          },
        };
        op.parameters = op.parameters?.filter((p: any) => p.in !== "body");
      }

      // Convert responses (Swagger 2 has schema directly, not under content)
      if (op.responses) {
        for (const [code, response] of Object.entries(op.responses)) {
          const resp = response as any;
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
  result.format = "swagger2" as any;
  return result;
}

import { describe, expect, it } from "vitest";
import { generateCode } from "../src/apis/generator";
import { parseSpec } from "../src/apis/parser";

const ok = { responses: { "200": { description: "ok" } } };

function parse(spec: object) {
  return parseSpec(JSON.stringify(spec));
}

function openapi(extra: Record<string, unknown>): object {
  return { openapi: "3.0.0", info: { title: "T", version: "1" }, paths: {}, ...extra };
}

function endpoints(spec: ReturnType<typeof parse>) {
  return spec.groups.flatMap((g) => g.endpoints);
}

describe("a reference the document cannot resolve", () => {
  it("skips the parameter instead of ending the import", () => {
    /* Kubernetes and DigitalOcean both point at other files. */
    const spec = openapi({
      paths: {
        "/things": {
          get: { operationId: "list", parameters: [{ $ref: "./common.yaml#/Limit" }], ...ok },
        },
      },
    });

    expect(() => parse(spec)).not.toThrow();
    expect(endpoints(parse(spec))[0]?.parameters).toEqual([]);
  });

  it("reads a pointer whose key contains a slash", () => {
    const spec = openapi({
      paths: {
        "/things": {
          get: {
            operationId: "list",
            parameters: [{ $ref: "#/components/parameters/odd~1name" }],
            ...ok,
          },
        },
      },
      components: { parameters: { "odd/name": { name: "limit", in: "query" } } },
    });

    expect(endpoints(parse(spec))[0]?.parameters[0]?.name).toBe("limit");
  });
});

describe("a path item", () => {
  it("shares its parameters with every operation under it", () => {
    const spec = openapi({
      paths: {
        "/things/{id}": {
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          get: { operationId: "read", ...ok },
          delete: { operationId: "remove", ...ok },
        },
      },
    });

    for (const endpoint of endpoints(parse(spec))) {
      expect(endpoint.parameters.map((p) => p.name)).toContain("id");
    }
  });

  it("does not duplicate a parameter an operation restates", () => {
    const spec = openapi({
      paths: {
        "/things/{id}": {
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          get: {
            operationId: "read",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
            ...ok,
          },
        },
      },
    });

    expect(endpoints(parse(spec))[0]?.parameters).toHaveLength(1);
  });

  it("that is empty does not end the import", () => {
    expect(() => parse(openapi({ paths: { "/things": null } }))).not.toThrow();
  });
});

describe("a request body that is not JSON", () => {
  it("is read rather than dropped", () => {
    /* Stripe sends every body form-encoded. */
    const spec = openapi({
      paths: {
        "/things": {
          post: {
            operationId: "create",
            requestBody: {
              content: {
                "application/x-www-form-urlencoded": {
                  schema: { type: "object", properties: { name: { type: "string" } } },
                },
              },
            },
            ...ok,
          },
        },
      },
    });

    expect(endpoints(parse(spec))[0]?.requestBody).not.toBeNull();
  });
});

describe("a success response that is not 200 or 201", () => {
  it("still provides the response schema", () => {
    const spec = openapi({
      paths: {
        "/things": {
          post: {
            operationId: "create",
            responses: {
              "202": {
                description: "accepted",
                content: {
                  "application/json": {
                    schema: { type: "object", properties: { id: { type: "string" } } },
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(endpoints(parse(spec))[0]?.responseSchema).not.toBeNull();
  });
});

describe("Swagger 2.0", () => {
  const swagger = (extra: Record<string, unknown>) => ({
    swagger: "2.0",
    info: { title: "T", version: "1" },
    paths: {},
    ...extra,
  });

  it("builds the base URL from scheme, host and base path", () => {
    const spec = parse(swagger({ schemes: ["https"], host: "api.example.com", basePath: "/v2" }));

    expect(spec.baseURL).toBe("https://api.example.com/v2");
  });

  it("carries the shared parameters section a pointer names", () => {
    const spec = parse(
      swagger({
        parameters: { Limit: { name: "limit", in: "query", type: "integer" } },
        paths: {
          "/things": { get: { operationId: "list", parameters: [{ $ref: "#/parameters/Limit" }] } },
        },
      }),
    );

    expect(endpoints(spec)[0]?.parameters[0]).toMatchObject({ name: "limit", type: "integer" });
  });

  it("reads its security definitions", () => {
    const spec = parse(
      swagger({ securityDefinitions: { key: { type: "apiKey", name: "X-Key", in: "header" } } }),
    );

    expect(spec.securitySchemes).toHaveLength(1);
  });

  it("turns form fields into a request body", () => {
    const spec = parse(
      swagger({
        paths: {
          "/things": {
            post: {
              operationId: "create",
              consumes: ["application/x-www-form-urlencoded"],
              parameters: [{ name: "title", in: "formData", type: "string", required: true }],
            },
          },
        },
      }),
    );

    const body = endpoints(spec)[0]?.requestBody;
    expect(body?.properties && Object.keys(body.properties)).toEqual(["title"]);
  });
});

describe("a definition that states only what it means", () => {
  it("is still declared, because other schemas name it", () => {
    /* Kubernetes writes two of these; a name nothing declares does not
       compile. */
    const files = generateCode(
      parse(
        openapi({
          paths: {
            "/things": {
              get: {
                operationId: "list",
                responses: {
                  "200": {
                    description: "ok",
                    content: {
                      "application/json": { schema: { $ref: "#/components/schemas/Holder" } },
                    },
                  },
                },
              },
            },
          },
          components: {
            schemas: {
              Holder: {
                type: "object",
                properties: { value: { $ref: "#/components/schemas/Anything" } },
              },
              Anything: { description: "Any valid JSON value." },
            },
          },
        }),
      ),
      { type: "openapi", sourceName: "api", outputDir: "src/api" },
    )
      .map((f) => f.content)
      .join("\n");

    expect(files).toMatch(/export (type|const) Anything/);
  });
});

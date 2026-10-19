/**
 * The auth middleware a source is generated with: the first security
 * scheme the specification declares, its secret read from a variable named
 * after the source on every request, by a reader that names no type a
 * schema of the source could take the place of.
 */
import { afterAll, describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { sourceAuth } from "../../src/apis/generator/auth-middleware";
import { parseSpec } from "../../src/apis/parser";
import type { ParsedSecurityScheme } from "../../src/apis/parser/types";
import { compileProject, removeProjects, STRICT, writeProject } from "../helpers/generated-project";

afterAll(() => removeProjects("auth-middleware"));

function middlewareOf(scheme: ParsedSecurityScheme): string | undefined {
  return sourceAuth([scheme], "pet-store")?.middleware;
}

describe("sourceAuth", () => {
  it("sends a bearer token, an OAuth 2 token and basic credentials from their variables", () => {
    expect(middlewareOf({ name: "b", type: "bearer" })).toBe(
      'authMiddleware({ getToken: () => requireEnv("PET_STORE_TOKEN") })',
    );
    expect(middlewareOf({ name: "o", type: "oauth2" })).toBe(
      'authMiddleware({ getToken: () => requireEnv("PET_STORE_ACCESS_TOKEN") })',
    );
    expect(middlewareOf({ name: "c", type: "basic" })).toBe(
      'authMiddleware({ scheme: "Basic", getToken: () => requireEnv("PET_STORE_CREDENTIALS") })',
    );
  });

  it("sends a key in the header the specification names", () => {
    expect(middlewareOf({ name: "k", type: "apiKey", in: "header", paramName: "X-Key" })).toBe(
      'authMiddleware({ header: "X-Key", scheme: "", getToken: () => requireEnv("PET_STORE_API_KEY") })',
    );
  });

  it("sends nothing for a key it cannot place in a header, or a scheme it does not know", () => {
    expect(
      middlewareOf({ name: "q", type: "apiKey", in: "query", paramName: "key" }),
    ).toBeUndefined();
    expect(
      middlewareOf({ name: "c", type: "apiKey", in: "cookie", paramName: "key" }),
    ).toBeUndefined();
    expect(middlewareOf({ name: "h", type: "apiKey", in: "header" })).toBeUndefined();
    expect(middlewareOf({ name: "u", type: "unknown" })).toBeUndefined();
    expect(sourceAuth([], "pet-store")).toBeNull();
  });

  it("sends nothing for a type no scheme has, one that refuses to be text among them", () => {
    for (const type of ["constructor", "__proto__", { toString: 1 }, null]) {
      const scheme: ParsedSecurityScheme = { name: "x", type: "bearer" };
      Reflect.set(scheme, "type", type);

      expect(middlewareOf(scheme)).toBeUndefined();
    }
  });

  it("sends the first scheme the specification declares, and only that one", () => {
    const auth = sourceAuth(
      [
        { name: "k", type: "apiKey", in: "header", paramName: "X-Key" },
        { name: "b", type: "bearer" },
      ],
      "api",
    );

    expect(auth?.middleware).toBe(
      'authMiddleware({ header: "X-Key", scheme: "", getToken: () => requireEnv("API_API_KEY") })',
    );
  });

  it("declares the reader beside the source, and the middleware asks it for the secret", () => {
    const auth = sourceAuth([{ name: "b", type: "bearer" }], "api");

    expect(auth?.helper.join("\n")).toContain("function requireEnv(name: string): string {");
    expect(auth?.middleware).toContain("getToken: () => requireEnv(");
  });

  it("compiles beside a schema named Record that the source imports", () => {
    const spec = parseSpec(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Shop", version: "1" },
        components: {
          securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
          schemas: { Record: { type: "object", properties: { id: { type: "string" } } } },
        },
        security: [{ bearer: [] }],
        paths: {
          "/records": {
            get: {
              operationId: "listRecords",
              responses: {
                "200": {
                  description: "ok",
                  content: {
                    "application/json": { schema: { $ref: "#/components/schemas/Record" } },
                  },
                },
              },
            },
          },
        },
      }),
    );
    const files = generateCode(
      spec,
      { type: "openapi", outputDir: "src/api", groupBy: "single", addAuthMiddleware: true },
      "shop",
    );
    const source = files.find((file) => file.path.endsWith("/source.ts"))?.content ?? "";

    expect(source).toMatch(/import \{[^}]*\bRecord\b/);
    expect(
      compileProject(
        writeProject("auth-middleware/record", files),
        ["src/api/shop/index.ts"],
        STRICT,
      ),
    ).toEqual([]);
  }, 60_000);
});

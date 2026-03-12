import type { ParsedSpec } from "../../src/codegen";

/** Create a minimal ParsedSpec with optional overrides — shared test helper */
export function makeSpec(overrides: Partial<ParsedSpec> = {}): ParsedSpec {
  return {
    title: "Test API",
    version: "1.0.0",
    description: "",
    baseURL: "/api",
    format: "openapi3",
    groups: [],
    schemas: {},
    securitySchemes: [],
    ...overrides,
  };
}

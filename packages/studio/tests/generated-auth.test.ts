import { describe, expect, it } from "vitest";

import { parseSpec } from "../src/apis/parser";
import { generateCode, applyImportDefaults, DEFAULT_OPTIONS } from "../src/apis/generator";

const SPEC = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Pet", version: "1" },
  servers: [{ url: "https://api.pet.test" }],
  paths: {
    "/p": { get: { operationId: "list", tags: ["p"], responses: { "200": { description: "ok" } } } },
  },
  components: { securitySchemes: { b: { type: "http", scheme: "bearer" } } },
  security: [{ b: [] }],
});

function source(options: Record<string, unknown> = {}): string {
  return (
    generateCode(
      parseSpec(SPEC),
      applyImportDefaults({ type: "openapi", sourceName: "pet", outputDir: "src", ...options }),
    ).find((f) => f.path.endsWith("source.ts"))?.content ?? ""
  );
}

describe("generated authentication", () => {
  it("is off unless asked for", () => {
    /* It reads the environment, so the module it lands in belongs on a
       server — and `generateClient: "direct"` puts that module in a browser
       bundle. */
    expect(DEFAULT_OPTIONS.addAuthMiddleware).toBe(false);
    expect(source()).not.toContain("Authorization");
  });

  it("refuses to send a token it does not have", () => {
    /* Interpolated directly, an unset variable was sent as the text
       "undefined" — answered with 401 and no hint why. Vite makes it certain:
       it replaces `process.env` with `{}`. */
    const out = source({ addAuthMiddleware: true });

    expect(out).toContain('requireEnv("PET_TOKEN")');
    expect(out).not.toMatch(/process\.env\.PET_TOKEN/);
    expect(out).toContain("is not set");
  });

  it("reads the environment without requiring Node type definitions", () => {
    const out = source({ addAuthMiddleware: true });

    expect(out).toContain("globalThis as {");
    expect(out).not.toMatch(/^\s*const value = process\.env/m);
  });

  it("writes the reader only when a header needs it", () => {
    expect(source({ addAuthMiddleware: true })).toContain("function requireEnv");
    expect(source()).not.toContain("function requireEnv");
  });
});

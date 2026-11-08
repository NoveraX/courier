import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, generateCode } from "../src/apis/generator";
import { parseSpec } from "../src/apis/parser";

const SPEC = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Pet", version: "1" },
  servers: [{ url: "https://api.pet.test" }],
  paths: {
    "/p": {
      get: { operationId: "list", tags: ["p"], responses: { "200": { description: "ok" } } },
    },
  },
  components: { securitySchemes: { b: { type: "http", scheme: "bearer" } } },
  security: [{ b: [] }],
});

function source(options: Record<string, unknown> = {}): string {
  return (
    generateCode(parseSpec(SPEC), {
      type: "openapi",
      sourceName: "pet",
      outputDir: "src",
      ...options,
    }).find((f) => f.path.endsWith("source.ts"))?.content ?? ""
  );
}

/* The reader the source declares, made JavaScript and run where `setup` says: the token it read, or why not. */
function readWith(setup: string): string {
  const out = source({ addAuthMiddleware: true });
  const start = out.indexOf("function requireEnv");
  const reader = out.slice(start, out.indexOf("\n}\n", start) + 2);
  const { code } = transformSync(reader, { loader: "ts" });
  return runInNewContext(
    `${setup};\n${code}\ntry { requireEnv("PET_TOKEN"); } catch (error) { "refused: " + error.message; }`,
    {},
  ) as string;
}

/* A variable, and a whole process, that code elsewhere in the app's process put on Object.prototype. */
const PLANTED_TOKEN = `Object.defineProperty(Object.prototype, "PET_TOKEN", { value: "made-up-planted-token", configurable: true })`;
const PLANTED_PROCESS = `Object.defineProperty(Object.prototype, "process", { value: { env: { PET_TOKEN: "made-up-planted-token" } }, configurable: true })`;

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

  it("sends the environment's own token, and refuses one Object.prototype holds as it refuses none", () => {
    expect(readWith(`globalThis.process = { env: { PET_TOKEN: "made-up-own-token" } }`)).toBe(
      "made-up-own-token",
    );
    expect(readWith("globalThis.process = { env: {} }")).toMatch(/^refused: PET_TOKEN is not set/);
    expect(readWith(`${PLANTED_TOKEN}; globalThis.process = { env: {} }`)).toMatch(
      /^refused: PET_TOKEN is not set/,
    );
  });

  it("reads no process the runtime does not own", () => {
    expect(readWith(PLANTED_PROCESS)).toMatch(/^refused: PET_TOKEN is not set/);
  });
});

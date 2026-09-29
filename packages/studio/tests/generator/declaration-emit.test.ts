/**
 * Generated files are application code, and a project that emits
 * declarations can compile them: every type their exports carry is one the
 * packages export, so TypeScript can name it in a `.d.ts`. It could not name
 * the builder types, and declaration emit failed on every generated file.
 */
import { join } from "node:path";
import type ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { compileProject, removeProjects, STRICT, writeProject } from "../helpers/generated-project";

const Pet = {
  type: "object",
  required: ["name"],
  properties: { name: { type: "string" }, tag: { type: "string" } },
};
const json = (schema: unknown) => ({ content: { "application/json": { schema } } });

const spec = parseSpec(
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Pets", version: "1" },
    servers: [{ url: "https://api.example/v1" }],
    paths: {
      "/pets": {
        get: {
          operationId: "listPets",
          tags: ["pets"],
          responses: { "200": { description: "ok", ...json({ type: "array", items: Pet }) } },
        },
        post: {
          operationId: "createPet",
          tags: ["pets"],
          requestBody: json(Pet),
          responses: { "200": { description: "ok", ...json(Pet) } },
        },
      },
      "/pets/{id}/events": {
        get: {
          operationId: "watchPet",
          tags: ["pets"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "events", content: { "text/event-stream": { schema: Pet } } },
          },
        },
      },
    },
  }),
);

const VARIANTS: [string, Partial<GenerateOptions>][] = [
  ["zod", {}],
  ["valibot", { validation: "valibot" }],
  ["arktype", { validation: "arktype" }],
  ["none", { validation: "none" }],
  ["flat", { groupBy: "single" }],
];

afterAll(() => {
  removeProjects("declaration-emit");
});

describe.each(VARIANTS)("a generated client validated with %s", (label, options) => {
  it("emits declarations", () => {
    const files = generateCode(spec, { type: "openapi", outputDir: "src/api", ...options }, "pets");
    const dir = writeProject(`declaration-emit/${label}`, files);
    const emitting: ts.CompilerOptions = {
      ...STRICT,
      noEmit: false,
      declaration: true,
      emitDeclarationOnly: true,
      outDir: join(dir, "types"),
    };

    expect(compileProject(dir, ["src/api/pets/index.ts"], emitting)).toEqual([]);
  }, 60_000);
});

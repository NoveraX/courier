/**
 * The type written beside a zod or valibot schema for an endpoint's
 * variables — a named body extended with its parameters — wrote an optional
 * parameter as `notify?: boolean`, where the validator infers
 * `boolean | undefined`. Under `exactOptionalPropertyTypes` the two did not
 * match, and a project with the option set did not compile the client.
 */
import { afterAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { compileProject, removeProjects, STRICT, writeProject } from "../helpers/generated-project";

const SPEC = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Pets", version: "1" },
  servers: [{ url: "https://api.example.com" }],
  components: {
    schemas: {
      Pet: { type: "object", required: ["name"], properties: { name: { type: "string" }, tag: { type: "string" } } },
    },
  },
  paths: {
    "/pets/{id}": {
      post: {
        operationId: "replacePet",
        tags: ["pets"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "notify", in: "query", schema: { type: "boolean" } },
        ],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } } },
        responses: { "200": { description: "ok", content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } } } },
      },
    },
  },
});

const VARIANTS: [string, Partial<GenerateOptions>][] = [
  ["zod", {}],
  ["valibot", { validation: "valibot" }],
];

afterAll(() => removeProjects("exact-optional-types"));

describe.each(VARIANTS)("a client validated with %s", (label, options) => {
  it("compiles under exactOptionalPropertyTypes", () => {
    const files = generateCode(parseSpec(SPEC), { type: "openapi", outputDir: "src/api", ...options }, "pets");
    const dir = writeProject(`exact-optional-types/${label}`, files);

    const errors = compileProject(dir, ["src/api/pets/index.ts"], { ...STRICT, exactOptionalPropertyTypes: true });

    expect(errors).toEqual([]);
  });
});

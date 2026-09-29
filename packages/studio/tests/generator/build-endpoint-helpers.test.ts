/**
 * An endpoint that answers with a body resolves to what it answered — typed
 * `unknown` where no type is written for it — and only one that answers with
 * nothing resolves to `void`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { compileProject, removeProjects, writeProject } from "../helpers/generated-project";

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Pets", version: "1" },
    servers: [{ url: "https://pets.test" }],
    paths: {
      "/pets/{petId}": {
        get: {
          operationId: "getPet",
          tags: ["pets"],
          parameters: [{ name: "petId", in: "path", required: true, schema: { type: "integer" } }],
          responses: {
            "200": {
              description: "ok",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } },
            },
          },
        },
        delete: {
          operationId: "deletePet",
          tags: ["pets"],
          parameters: [{ name: "petId", in: "path", required: true, schema: { type: "integer" } }],
          responses: { "204": { description: "gone" } },
        },
      },
    },
    components: { schemas: { Pet: { type: "object", properties: { name: { type: "string" } } } } },
  }),
);

const CONSUMER = `import { petsApi } from "./src/api/pets";

type IsVoid<T> = [T] extends [void] ? true : false;

export const answers: IsVoid<Awaited<ReturnType<typeof petsApi.pets.getPet>>> = false;
export const nothing: IsVoid<Awaited<ReturnType<typeof petsApi.pets.deletePet>>> = true;
`;

const VARIANTS: [string, Partial<GenerateOptions>][] = [
  ["no-types", { validation: "none", generateTypes: false }],
  ["neither", { generateSchemas: false, generateTypes: false }],
  ["zod", {}],
  ["none", { validation: "none" }],
];

let problems = new Map<string, string[]>();

beforeAll(() => {
  problems = new Map(
    VARIANTS.map(([label, options]) => {
      const files = generateCode(
        SPEC,
        { type: "openapi", outputDir: "src/api", ...options },
        "pets",
      );
      const dir = writeProject(`build-endpoint-helpers/${label}`, files, {
        "consumer.ts": CONSUMER,
      });
      return [label, compileProject(dir, ["consumer.ts"])];
    }),
  );
}, 120_000);

afterAll(() => {
  removeProjects("build-endpoint-helpers");
});

describe("an endpoint's answer", () => {
  it.each(VARIANTS.map(([label]) => label))("is void only when there is none, %s", (label) => {
    expect(problems.get(label)).toEqual([]);
  });
});

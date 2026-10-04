/**
 * A generated client keeps the fields an answer has beyond its
 * specification, whichever validator checks it, so the validator chosen
 * never changes the data an app gets — zod and valibot strip such fields
 * by default, where ArkType and no validation keep them. With types
 * generated, the slots keep the declared types, so a misspelt variable is
 * still a type error.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import type { ParsedSpec } from "../../src/apis/parser/types";
import {
  compileProject,
  endpointAt,
  loadGenerated,
  removeProjects,
  STRICT,
  writeProject,
} from "../helpers/generated-project";
import { startUpstreamServer, type UpstreamServer } from "../helpers/upstream-server";

const Pet = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string" },
    owner: { type: "object", properties: { id: { type: "integer" } } },
  },
};
const json = (schema: unknown) => ({ content: { "application/json": { schema } } });
const petId = { name: "id", in: "path", required: true, schema: { type: "integer" } };

function spec(origin: string): ParsedSpec {
  return parseSpec(
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Pets", version: "1" },
      servers: [{ url: `${origin}/v1` }],
      paths: {
        "/pets/{id}": {
          get: {
            operationId: "getPet",
            tags: ["pets"],
            parameters: [petId],
            responses: {
              "200": { description: "ok", ...json({ $ref: "#/components/schemas/Pet" }) },
            },
          },
          put: {
            operationId: "updatePet",
            tags: ["pets"],
            parameters: [petId],
            requestBody: json({ $ref: "#/components/schemas/Pet" }),
            responses: {
              "200": { description: "ok", ...json({ $ref: "#/components/schemas/Pet" }) },
            },
          },
        },
      },
      components: { schemas: { Pet } },
    }),
  );
}

const VARIANTS: [string, Partial<GenerateOptions>][] = [
  ["zod", {}],
  ["valibot", { validation: "valibot" }],
  ["arktype", { validation: "arktype" }],
  ["none", { validation: "none" }],
  ["zod-no-types", { generateTypes: false }],
];

const ANSWER = { name: "rex", color: "brown", owner: { id: 7, since: "2026" } };

let upstream: UpstreamServer;

beforeAll(async () => {
  upstream = await startUpstreamServer(ANSWER);
});

afterAll(async () => {
  await upstream.close();
  removeProjects("loose-answers");
});

function generate(options: Partial<GenerateOptions>) {
  return generateCode(
    spec(upstream.origin),
    { type: "openapi", outputDir: "src/api", ...options },
    "pets",
  );
}

describe.each(VARIANTS)("a generated client validated with %s", (label, options) => {
  it("keeps the fields an answer has beyond its specification, at any depth", async () => {
    const { petsApi } = loadGenerated(generate(options), "src/api/pets/index.ts");

    expect(await endpointAt(petsApi, "pets", "getPet")({ id: 1 })).toEqual(ANSWER);
  });

  it("compiles with every unused name reported", () => {
    const dir = writeProject(`loose-answers/${label}`, generate(options));
    const strictest = { ...STRICT, noUnusedLocals: true, noUnusedParameters: true };

    expect(compileProject(dir, ["src/api/pets/index.ts"], strictest)).toEqual([]);
  }, 60_000);
});

describe.each(VARIANTS.filter(([label]) => label !== "zod-no-types"))(
  "the types of a client validated with %s",
  (label, options) => {
    it("say what the specification declares, and refuse a misspelt variable", () => {
      const use = [
        'import { petsApi } from "./api/pets";',
        "export async function use(): Promise<string> {",
        "  const pet = await petsApi.pets.getPet({ id: 1 });",
        "  // @ts-expect-error nmae is not a field of Pet",
        '  await petsApi.pets.updatePet({ id: 1, name: "x", nmae: "y" });',
        "  const name: string = pet.name;",
        "  return name;",
        "}",
        "",
      ].join("\n");
      const dir = writeProject(`loose-answers/${label}-use`, generate(options), {
        "src/use.ts": use,
      });

      expect(compileProject(dir, ["src/use.ts"], STRICT)).toEqual([]);
    }, 60_000);
  },
);

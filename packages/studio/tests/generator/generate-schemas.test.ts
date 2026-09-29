/**
 * A types file — written when no validator schemas are asked for — declares
 * every schema the endpoints name, whatever its shape: a union, a list, a
 * primitive, an alias of another schema. Written for objects and enums
 * alone, the endpoints imported names it never declared.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { compileProject, removeProjects, STRICT, writeProject } from "../helpers/generated-project";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const get = (operationId: string, schema: unknown) => ({
  get: {
    operationId,
    tags: ["pets"],
    responses: { "200": { description: "ok", content: { "application/json": { schema } } } },
  },
});

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Pets", version: "1" },
    servers: [{ url: "https://pets.test" }],
    paths: {
      "/pet": get("getPet", ref("Pet")),
      "/list": get("listCats", ref("CatList")),
      "/id": get("getId", ref("PetId")),
      "/alias": get("getAlias", ref("CatAlias")),
      "/kind": get("getKind", ref("Kind")),
      "/names": get("getNames", ref("Names")),
    },
    components: {
      schemas: {
        Cat: { type: "object", required: ["meow"], properties: { meow: { type: "boolean" } } },
        Dog: { type: "object", required: ["bark"], properties: { bark: { type: "boolean" } } },
        Pet: { oneOf: [ref("Cat"), ref("Dog")] },
        CatList: { type: "array", items: ref("Cat") },
        PetId: { type: "string" },
        CatAlias: ref("Cat"),
        Kind: { type: "string", enum: ["cat", "dog"] },
        Names: { type: "array", items: { type: "string" } },
      },
    },
  }),
);

function consumer(flat: boolean): string {
  const pets = flat ? "" : "pets.";
  return `import { petsApi } from "./src/api/pets";
import type { CatList, Kind, Names, Pet, PetId } from "./src/api/pets";

export async function calls(): Promise<void> {
  const pet: Pet = await petsApi.${pets}getPet();
  const cats: CatList = await petsApi.${pets}listCats();
  const id: PetId = await petsApi.${pets}getId();
  const meow: boolean = (await petsApi.${pets}getAlias()).meow;
  const kind: Kind = await petsApi.${pets}getKind();
  const names: Names = await petsApi.${pets}getNames();
  const first: string | undefined = names[0];
  // @ts-expect-error a kind is one of two words
  const wrong: Kind = "bird";
  void [pet, cats, id, meow, kind, first, wrong];
}
`;
}

const VARIANTS: [string, Partial<GenerateOptions>][] = [
  ["types-only", { generateSchemas: false }],
  ["types-only-single", { generateSchemas: false, groupBy: "single" }],
  ["none", { validation: "none" }],
  ["none-single", { validation: "none", groupBy: "single" }],
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
      const flat = options.groupBy === "single";
      const dir = writeProject(`generate-schemas/${label}`, files, {
        "consumer.ts": consumer(flat),
      });
      return [
        label,
        compileProject(dir, ["consumer.ts"], { ...STRICT, noUncheckedIndexedAccess: true }),
      ];
    }),
  );
}, 120_000);

afterAll(() => {
  removeProjects("generate-schemas");
});

describe("a file of types", () => {
  it.each(VARIANTS.map(([label]) => label))(
    "declares every schema the endpoints name, %s",
    (label) => {
      expect(problems.get(label)).toEqual([]);
    },
  );
});

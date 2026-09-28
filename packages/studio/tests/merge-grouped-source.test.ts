/**
 * The source of an API grouped by tag lists its groups and holds no
 * endpoint, so there is nothing in it to merge: an update or a second import
 * writes it as generated, while the groups it lists still merge. An API that
 * changes shape between a flat source and groups gets the generated source.
 */
import { describe, expect, it } from "vitest";

import type { GeneratedFile, GenerateOptions } from "../src/apis/generator/types";

import { generateCode } from "../src/apis/generator/generate-code";
import { mergeGroupFile } from "../src/apis/merge/merge-group";
import { previewUpdate } from "../src/apis/merge/update-flow";
import { parseSpec } from "../src/apis/parser/parse-spec";

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Petstore", version: "1" },
    servers: [{ url: "https://petstore.example" }],
    paths: {
      "/pets": {
        get: { operationId: "listPets", tags: ["pets"], responses: { "200": { description: "ok" } } },
      },
      "/store/orders": {
        get: { operationId: "listOrders", tags: ["store"], responses: { "200": { description: "ok" } } },
      },
    },
  }),
);

const GROUPED: GenerateOptions = { type: "openapi", outputDir: "src/api", sourceName: "petstore" };
const SOURCE = "src/api/petstore/source.ts";
const PETS = "src/api/petstore/pets/index.ts";

function onDisk(files: GeneratedFile[]): Record<string, string> {
  return Object.fromEntries(files.map((file) => [file.path, file.content]));
}

function contentOf(files: GeneratedFile[], path: string): string {
  const file = files.find((candidate) => candidate.path === path);
  if (!file) throw new Error(`${path} was not generated`);
  return file.content;
}

describe("the source of an API grouped by tag", () => {
  it("is written as generated when the same code is written again", () => {
    const generated = generateCode(SPEC, GROUPED);

    const result = previewUpdate({}, generated, onDisk(generated));

    const source = result.files.find((file) => file.path === SOURCE);
    expect(source?.content).toBe(contentOf(generated, SOURCE));
    expect(source?.content).toContain("export const petstore = defineApi({");
    expect(source?.status).toBe("safe");
  });

  it("leaves the groups it lists to merge", () => {
    const generated = generateCode(SPEC, GROUPED);
    const edited = contentOf(generated, PETS).replace(
      "  endpoints: {\n",
      '  endpoints: {\n    adopt: endpoint.post("adopt"),\n',
    );

    const result = previewUpdate({}, generated, { ...onDisk(generated), [PETS]: edited });

    const pets = result.files.find((file) => file.path === PETS);
    expect(pets?.status).toBe("merged");
    expect(pets?.content).toContain('adopt: endpoint.post("adopt"),');
    expect(pets?.content).toContain("export const pets = defineGroup({");
  });
});

describe("a source that changes shape", () => {
  it("takes the generated groups when its endpoints were inline", () => {
    const flat = generateCode(SPEC, { ...GROUPED, groupBy: "single" });
    const grouped = generateCode(SPEC, GROUPED);

    const result = previewUpdate({}, grouped, onDisk(flat));

    expect(result.files.find((file) => file.path === SOURCE)?.content).toBe(
      contentOf(grouped, SOURCE),
    );
  });

  it("takes the generated inline endpoints when it listed groups", () => {
    const grouped = generateCode(SPEC, GROUPED);
    const flat = generateCode(SPEC, { ...GROUPED, groupBy: "single" });

    const result = previewUpdate({}, flat, onDisk(grouped));

    expect(result.files.find((file) => file.path === SOURCE)?.content).toBe(
      contentOf(flat, SOURCE),
    );
  });
});

describe("a group's declaration with an option added by hand", () => {
  it("keeps the option, and takes the spec's prefix", () => {
    const onDisk = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/people",
  headers: { "x-team": "core" },
  endpoints: {
    list: endpoint.get("").response<string[]>(),
  },
});
`;
    const fresh = `import { courier, defineGroup } from "@noverax/courier/define";

const { endpoint } = courier();

export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    list: endpoint.get("").response<string[]>(),
  },
});
`;
    const { content } = mergeGroupFile(onDisk, fresh, { endpoints: { list: "safe" }, existingCode: {} });

    expect(content).toContain('headers: { "x-team": "core" },');
    expect(content).toContain('prefix: "/users",');
  });
});

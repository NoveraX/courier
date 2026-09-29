/**
 * A bundled specification — DigitalOcean's, as published — writes each
 * schema once, where it is first used, and points every later use at that
 * place: `#/paths/~1v2~1droplets/get/…/items`. Such a reference names no
 * component, so it has to be read where it points; named after the last
 * segment of the pointer, it produced types called `Items` and `_1` that
 * nothing declared.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GenerateOptions } from "../../src/apis/generator";
import { generateCode } from "../../src/apis/generator";
import { parseSpec } from "../../src/apis/parser";
import { compileProject, removeProjects, writeProject } from "../helpers/generated-project";

const json = (schema: unknown) => ({ content: { "application/json": { schema } } });
const pointer = (...segments: string[]) =>
  `#/${segments.map((s) => s.replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
const REGION = pointer(
  "paths",
  "/v2/regions",
  "get",
  "responses",
  "200",
  "content",
  "application/json",
  "schema",
  "properties",
  "regions",
  "items",
);
const DROPLET = pointer(
  "paths",
  "/v2/droplets/{droplet_id}",
  "get",
  "responses",
  "200",
  "content",
  "application/json",
  "schema",
  "properties",
  "droplet",
);
const NODE = pointer(
  "paths",
  "/v2/tree",
  "get",
  "responses",
  "200",
  "content",
  "application/json",
  "schema",
);

const SPEC = parseSpec(
  JSON.stringify({
    openapi: "3.0.0",
    info: { title: "Ocean", version: "2.0" },
    servers: [{ url: "https://api.ocean.test" }],
    paths: {
      "/v2/regions": {
        get: {
          operationId: "listRegions",
          tags: ["Regions"],
          responses: {
            "200": {
              description: "ok",
              ...json({
                type: "object",
                properties: {
                  regions: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["slug"],
                      properties: { slug: { type: "string" }, available: { type: "boolean" } },
                    },
                  },
                },
              }),
            },
          },
        },
      },
      "/v2/droplets/{droplet_id}": {
        get: {
          operationId: "getDroplet",
          tags: ["Droplets"],
          parameters: [
            { name: "droplet_id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            "200": {
              description: "ok",
              ...json({
                type: "object",
                properties: {
                  droplet: {
                    type: "object",
                    required: ["id", "name"],
                    properties: {
                      id: { type: "integer" },
                      name: { type: "string" },
                      region: { $ref: REGION },
                      size: {
                        allOf: [
                          { $ref: REGION },
                          { type: "object", properties: { vcpus: { type: "integer" } } },
                        ],
                      },
                    },
                  },
                },
              }),
            },
          },
        },
      },
      "/v2/droplets": {
        get: {
          operationId: "listDroplets",
          tags: ["Droplets"],
          responses: {
            "200": {
              description: "ok",
              ...json({
                type: "object",
                properties: { droplets: { type: "array", items: { $ref: DROPLET } } },
              }),
            },
          },
        },
        post: {
          operationId: "createDroplet",
          tags: ["Droplets"],
          requestBody: json({
            allOf: [{ $ref: REGION }, { type: "object", properties: { name: { type: "string" } } }],
          }),
          responses: { "202": { description: "ok", ...json({ $ref: DROPLET }) } },
        },
      },
      "/v2/tree": {
        get: {
          operationId: "getTree",
          tags: ["Tree"],
          responses: {
            "200": {
              description: "ok",
              ...json({
                type: "object",
                properties: {
                  label: { type: "string" },
                  children: { type: "array", items: { $ref: NODE } },
                },
              }),
            },
          },
        },
      },
    },
  }),
);

function consumer(flat: boolean): string {
  const [droplets, regions, tree] = flat ? ["", "", ""] : ["droplets.", "regions.", "tree."];
  return `import { oceanApi } from "./src/api/ocean";

export async function calls(): Promise<void> {
  const list = await oceanApi.${droplets}listDroplets();
  const name: string | undefined = list.droplets?.[0]?.name;
  const slug: string | undefined = list.droplets?.[0]?.region?.slug;
  const one = await oceanApi.${droplets}getDroplet({ droplet_id: 1 });
  const vcpus: number | undefined = one.droplet?.size?.vcpus;
  const created = await oceanApi.${droplets}createDroplet({ slug: "nyc1", name: "web" });
  const id: number | undefined = created.id;
  const regions = await oceanApi.${regions}listRegions();
  const available: boolean | undefined = regions.regions?.[0]?.available;
  const node = await oceanApi.${tree}getTree();
  const label: string | undefined = node.label;
  // @ts-expect-error a region's slug is text
  const wrong: number | undefined = list.droplets?.[0]?.region?.slug;
  void [name, slug, vcpus, id, available, label, wrong];
}
`;
}

const VARIANTS: [string, Partial<GenerateOptions>][] = [
  ["zod", {}],
  ["valibot", { validation: "valibot" }],
  ["arktype", { validation: "arktype" }],
  ["none", { validation: "none" }],
  ["types-only", { generateSchemas: false }],
  ["single", { groupBy: "single" }],
];

let problems = new Map<string, string[]>();

beforeAll(() => {
  problems = new Map(
    VARIANTS.map(([label, options]) => {
      const files = generateCode(
        SPEC,
        { type: "openapi", outputDir: "src/api", ...options },
        "ocean",
      );
      const flat = options.groupBy === "single";
      const dir = writeProject(`pointer-refs/${label}`, files, { "consumer.ts": consumer(flat) });
      return [label, compileProject(dir, ["consumer.ts"])];
    }),
  );
}, 180_000);

afterAll(() => {
  removeProjects("pointer-refs");
});

describe("a reference into another part of the document", () => {
  it.each(VARIANTS.map(([label]) => label))("is read where it points, for %s", (label) => {
    expect(problems.get(label)).toEqual([]);
  });

  it("names no schema after the last segment of its pointer", () => {
    const refs = JSON.stringify(SPEC).match(/"refName":"[^"]*"/g) ?? [];

    expect(refs).toEqual([]);
  });
});

/**
 * Each group is imported under a name its module binds nothing else by:
 * the one it would like, or the first numbered one left free. An OpenAPI
 * 3.2 tag "pets group" around "pets" made a parent file importing
 * `pets as petsGroup` beside its own `petsGroup`, and names a transform
 * gives clashed with the source's own or a schema's constant.
 */
import { afterAll, describe, expect, it } from "vitest";

import { generateCode } from "../../src/apis/generator";
import { freeName, moduleLocalNames } from "../../src/apis/generator/module-local-names";
import { parseSpec } from "../../src/apis/parser";
import type { ParsedGroup, ParsedSpec } from "../../src/apis/parser/types";
import { compileProject, removeProjects, STRICT, writeProject } from "../helpers/generated-project";

afterAll(() => removeProjects("module-local-names"));

function compiles(label: string, spec: ParsedSpec): string[] {
  const files = generateCode(spec, { type: "openapi", outputDir: "src/api" }, "shop");
  return compileProject(
    writeProject(`module-local-names/${label}`, files),
    ["src/api/shop/index.ts"],
    STRICT,
  );
}

const group = (name: string, endpoint: string): ParsedGroup => ({
  name,
  description: "",
  prefix: `/${name}`,
  endpoints: [
    {
      name: endpoint,
      operationId: endpoint,
      httpMethod: "get",
      path: "/",
      fullPath: `/${name}`,
      description: "",
      secured: false,
      requestBody: null,
      parameters: [],
      responseSchema: null,
      tags: [name],
    },
  ],
});

describe("moduleLocalNames", () => {
  it("gives each group the name it would like, or the first numbered one left free", () => {
    const locals = moduleLocalNames(
      new Map([
        ["pets", "petsGroup"],
        ["store", "store"],
        ["kinds", "petsGroup"],
      ]),
      new Set(["petsGroup", "store"]),
    );

    expect([...locals]).toEqual([
      ["pets", "petsGroup_2"],
      ["store", "store_2"],
      ["kinds", "petsGroup_3"],
    ]);
  });

  it("takes the name wanted when it is free", () => {
    expect(freeName("pets", new Set(["store"]))).toBe("pets");
  });
});

describe("generated groups, their names clashing", () => {
  it("compiles an OpenAPI 3.2 tag around one named as it with Group added", () => {
    const ok = { 204: { description: "none" } };
    const spec = parseSpec(
      JSON.stringify({
        openapi: "3.2.0",
        info: { title: "Pets", version: "1" },
        servers: [{ url: "https://pets.test" }],
        tags: [{ name: "pets group" }, { name: "pets", parent: "pets group" }],
        paths: {
          "/a": { get: { operationId: "inParent", tags: ["pets group"], responses: ok } },
          "/b": { get: { operationId: "inChild", tags: ["pets"], responses: ok } },
        },
      }),
    );

    expect(compiles("inner", spec)).toEqual([]);
  });

  it("compiles a group named as the source's alias, and one named as a schema's constant", () => {
    const base = parseSpec(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Shop", version: "1" },
        servers: [{ url: "https://shop.test" }],
        paths: {
          "/own": {
            get: {
              operationId: "own",
              responses: {
                200: {
                  description: "ok",
                  content: {
                    "application/json": { schema: { $ref: "#/components/schemas/Thing" } },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: { Thing: { type: "object", properties: { id: { type: "string" } } } },
        },
      }),
    );
    const crafted = {
      ...base,
      groups: [
        ...base.groups,
        group("shop", "listShop"),
        group("group_shop", "listGroupShop"),
        group("ThingSchema", "listThings"),
      ],
    };

    expect(compiles("source", crafted)).toEqual([]);
  });
});

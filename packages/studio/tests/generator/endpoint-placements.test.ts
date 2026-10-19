/**
 * Endpoints grouped by path: a group is named after the segment its
 * resource takes, within the 128 characters a folder's name is made from,
 * and numbered when another segment made the same name — however many
 * endpoints share one.
 */
import { describe, expect, it } from "vitest";
import { generateCode } from "../../src/apis/generator";
import { placeEndpoints } from "../../src/apis/generator/endpoint-placements";
import { parseSpec } from "../../src/apis/parser";
import type { ParsedEndpoint } from "../../src/apis/parser/types";

const ok = { 200: { description: "ok" } };

function spec(...paths: string[]) {
  return parseSpec(
    JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Shop", version: "1" },
      paths: Object.fromEntries(
        paths.map((path, at) => [path, { get: { operationId: `get${at}`, responses: ok } }]),
      ),
    }),
  );
}

describe("placeEndpoints, by path", () => {
  it("names a group after a segment of 129 characters within 128, and the import is generated", () => {
    const parsed = spec(`/${"s".repeat(129)}`, "/store");
    const files = generateCode(
      parsed,
      { type: "openapi", outputDir: "src/api", groupBy: "path" },
      "shop",
    );

    expect(new Set(placeEndpoints(parsed, "path").map((p) => p.group.name))).toEqual(
      new Set(["s".repeat(128), "store"]),
    );
    expect(files.some((file) => file.path === `src/api/shop/${"s".repeat(128)}/index.ts`)).toBe(
      true,
    );
  });

  it("numbers segments that make one name", () => {
    const names = placeEndpoints(spec("/pet-store", "/pet_store", "/petStore"), "path").map(
      (placement) => placement.group.name,
    );

    expect(names).toEqual(["petStore", "petStore2", "petStore3"]);
  });

  it("groups 300 000 endpoints under one segment", () => {
    const endpoint = (fullPath: string, at: number): ParsedEndpoint => ({
      name: `get${at}`,
      operationId: `get${at}`,
      httpMethod: "get",
      path: fullPath,
      fullPath,
      description: "",
      secured: false,
      requestBody: null,
      parameters: [],
      responseSchema: null,
      tags: [],
    });
    const items = Array.from({ length: 300_000 }, (_, at) => endpoint(`/items/${at}`, at));
    const placed = placeEndpoints(
      {
        ...spec(),
        groups: [
          {
            name: "all",
            description: "",
            prefix: "/",
            endpoints: [...items, endpoint("/orders", -1)],
          },
        ],
      },
      "path",
    );

    expect(placed).toHaveLength(300_001);
    expect(new Set(placed.map((placement) => placement.group.name))).toEqual(
      new Set(["items", "orders"]),
    );
  });
});

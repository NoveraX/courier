/**
 * Endpoints grouped by path: a group is named after the segment its
 * resource takes, within the 128 characters a folder's name is made from,
 * and numbered when another segment made the same name.
 */
import { describe, expect, it } from "vitest";
import { generateCode } from "../../src/apis/generator";
import { placeEndpoints } from "../../src/apis/generator/endpoint-placements";
import { parseSpec } from "../../src/apis/parser";

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
});

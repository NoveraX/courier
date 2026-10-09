/**
 * The endpoints `--include` and `--exclude` pick for a write, as Import
 * API's Select step picks them, and the selectors an import declared in
 * courier.config.ts already holds.
 */
import type { CourierImportEntry } from "@noverax/courier/config";
import { describe, expect, it } from "vitest";

import { type GenerateOptions, parseSpec } from "../../../src/apis";
import { checkDeclaredSelectors, selectedBy } from "../../../src/commands/import/selection";

const ok = { 200: { description: "ok" } };
const spec = parseSpec(
  JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Pet Store", version: "1" },
    paths: {
      "/pets": {
        get: { tags: ["pets"], operationId: "listPets", responses: ok },
        post: { tags: ["pets"], operationId: "createPet", responses: ok },
      },
      "/store/inventory": { get: { tags: ["store"], operationId: "getInventory", responses: ok } },
    },
  }),
);

/* The name the parser gives the endpoint of an operationId. */
function named(operationId: string): string {
  const all = spec.groups.flatMap((group) => group.endpoints);
  return all.find((endpoint) => endpoint.operationId === operationId)?.name ?? "";
}

const options = (more: Partial<GenerateOptions>) =>
  ({ type: "openapi", outputDir: "src/api", ...more }) satisfies GenerateOptions;

describe("the endpoints a write picks", () => {
  it("are every endpoint without a selector, and those the selectors leave otherwise", () => {
    expect(selectedBy(spec, options({}))).toBeNull();
    expect(
      selectedBy(
        spec,
        options({ include: { tags: ["pets"] }, exclude: { operationIds: ["createPet"] } }),
      ),
    ).toEqual({ pets: [named("listPets")] });
    expect(selectedBy(spec, options({ exclude: { paths: ["/pets"] } }))).toEqual({
      store: [named("getInventory")],
    });
  });

  it("are refused when the selectors leave none", () => {
    expect(() => selectedBy(spec, options({ include: { tags: ["users"] } }))).toThrow(
      "--include and --exclude leave none of the specification's endpoints",
    );
  });
});

describe("selectors against the import's declaration", () => {
  const declared = {
    importType: "file",
    type: "openapi",
    outputDir: "src/api",
    include: { tags: ["pets", "store"] },
  } satisfies CourierImportEntry;

  it("pass when they name what the config declares, in any order, or are left out", () => {
    expect(() =>
      checkDeclaredSelectors("pets", declared, options({ include: { tags: ["store", "pets"] } })),
    ).not.toThrow();
    expect(() => checkDeclaredSelectors("pets", declared, options({}))).not.toThrow();
    expect(() =>
      checkDeclaredSelectors("pets", undefined, options({ include: { tags: ["x"] } })),
    ).not.toThrow();
  });

  it("are refused when they name something else", () => {
    expect(() =>
      checkDeclaredSelectors("pets", declared, options({ include: { tags: ["pets"] } })),
    ).toThrow("courier.config.ts declares pets with another include");
    expect(() =>
      checkDeclaredSelectors("pets", declared, options({ exclude: { tags: ["store"] } })),
    ).toThrow("with another exclude");
  });
});

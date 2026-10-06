/**
 * Generated imports and re-exports come in the order Biome's import
 * organizer keeps them, so a project that lints the order accepts the code
 * as generated. The expected orders are Biome's own, read from `biome check
 * --write` on these same lists.
 */
import { describe, expect, it } from "vitest";

import {
  compareNames,
  compareSpecifiers,
  sortedStatements,
} from "../../src/apis/generator/import-order";
import { namedStatement } from "../../src/apis/generator/named-statement";

describe("compareNames", () => {
  it("orders names as Biome orders imported names", () => {
    const names = ["Pet10Schema", "Pet2Schema", "pet", "PetSchema", "Pet", "_Pet", "PET"];
    const biome = ["_Pet", "PET", "Pet", "Pet2Schema", "Pet10Schema", "PetSchema", "pet"];

    expect([...names].sort(compareNames)).toEqual(biome);
  });

  it("puts a name before the longer names it starts", () => {
    expect(compareNames("Invoice", "InvoiceSchema")).toBeLessThan(0);
    expect(compareNames("PetA", "Pet_a")).toBeGreaterThan(0);
  });
});

describe("compareSpecifiers", () => {
  it("orders paths as Biome orders the statements naming them", () => {
    const specifiers = [
      "./schemas",
      "../users/index",
      "../schemas",
      "../a-b/index",
      "../a/index",
      "../Zeta/index",
      "../types",
      "../web-hooks/index",
      "../_con/index",
      "../s/index",
      "../v10/index",
      "../v2/index",
    ];
    const biome = [
      "../_con/index",
      "../a/index",
      "../a-b/index",
      "../s/index",
      "../schemas",
      "../types",
      "../users/index",
      "../v2/index",
      "../v10/index",
      "../web-hooks/index",
      "../Zeta/index",
      "./schemas",
    ];

    expect([...specifiers].sort(compareSpecifiers)).toEqual(biome);
  });

  it("puts packages first, a scoped one before the rest", () => {
    const specifiers = [
      "valibot",
      "./schemas",
      "arktype",
      "@noverax/courier/define",
      "@noverax/courier",
    ];

    expect([...specifiers].sort(compareSpecifiers)).toEqual([
      "@noverax/courier",
      "@noverax/courier/define",
      "arktype",
      "valibot",
      "./schemas",
    ]);
  });
});

describe("sortedStatements", () => {
  it("sorts statements by their module, keeping the order of those naming one", () => {
    expect(
      sortedStatements([
        'import { user } from "./user/index";',
        'import type * as ark from "arktype";',
        'import { pet } from "./pet/index";',
        'import { type } from "arktype";',
      ]),
    ).toEqual([
      'import type * as ark from "arktype";',
      'import { type } from "arktype";',
      'import { pet } from "./pet/index";',
      'import { user } from "./user/index";',
    ]);
  });
});

describe("namedStatement", () => {
  it("lists the names in Biome's order, whatever marks one a type", () => {
    expect(namedStatement("import", ["PetSchema", "type Pet", "type Category"], "./schemas")).toBe(
      'import { type Category, type Pet, PetSchema } from "./schemas";',
    );
  });
});

/**
 * The imports code added to a file needs: each name it uses, one spread
 * among them. Valibot joins a body's schema with an endpoint's parameters
 * by spreading its entries, `...PetUpdateSchema.entries`; a name right
 * after the dots counted as a member read, its import was left out, and
 * the file Manage added the endpoint to did not compile.
 */
import { describe, expect, it } from "vitest";

import { referencedImports } from "../../../src/apis/manage/referenced-imports";
import type { ParsedImport } from "../../../src/apis/merge/types";

const SCHEMAS: ParsedImport = {
  raw: 'import { type Pet, PetSchema, PetUpdateSchema, StoreSchema } from "./schemas";',
  source: "./schemas",
  names: ["PetSchema", "PetUpdateSchema", "StoreSchema"],
  typeNames: ["Pet"],
};

describe("referencedImports", () => {
  it("keeps a name the code spreads, as Valibot joins a body with parameters", () => {
    const code =
      'updatePet: endpoint.put(":petId").variables<Pet>(v.object({ ...PetUpdateSchema.entries, petId: v.string() })),';

    expect(referencedImports([SCHEMAS], code)).toEqual([
      { ...SCHEMAS, names: ["PetUpdateSchema"], typeNames: ["Pet"] },
    ]);
  });

  it("keeps a name the code calls a method of or passes, and not one it reads as a member", () => {
    const code = 'getPet: endpoint.get(":petId").response(PetSchema), list: shop.StoreSchema,';

    expect(referencedImports([SCHEMAS], code)).toEqual([
      { ...SCHEMAS, names: ["PetSchema"], typeNames: [] },
    ]);
  });
});

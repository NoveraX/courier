import { describe, expect, it } from "vitest";
import { mergeImports } from "../src/apis/merge/merge-imports";
import { parseExistingGroup } from "../src/apis/merge/parse-existing";
import type { MergeChange } from "../src/apis/merge/types";

const GROUP = `
export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.get("").response<User[]>(),
  },
});
`;

/**
 * Imports are merged by the module they name. An import the parser cannot read
 * has no module to merge on, so every one of them would key alike and all but
 * the last would be dropped.
 */
describe("a type-only import of the schemas", () => {
  it("reads every name it binds as a type", () => {
    const parsed = parseExistingGroup(`import type {
  ListPetsParams,
  Pet,
} from "./schemas";
${GROUP}`);

    expect(parsed.imports).toHaveLength(1);
    expect(parsed.imports[0]?.source).toBe("./schemas");
    expect(parsed.imports[0]?.names).toEqual([]);
    expect(parsed.imports[0]?.typeNames).toEqual(["ListPetsParams", "Pet"]);
  });

  it("stays type-only through a merge when the update imports types alone", () => {
    const existing = parseExistingGroup(`import type { Pet } from "./schemas";\n${GROUP}`);
    const generated = parseExistingGroup(`import type { Pet, Owner } from "./schemas";\n${GROUP}`);

    const merged = mergeImports(existing.imports, generated.imports, [], "").join("\n");

    expect(merged).toBe('import type { Owner, Pet } from "./schemas";');
  });

  it("joins the schema a newer version validates with, without importing a name twice", () => {
    const existing = parseExistingGroup(`import type { Pet } from "./schemas";\n${GROUP}`);
    const generated = parseExistingGroup(
      `import { PetSchema, type Pet } from "./schemas";\n${GROUP}`,
    );

    const merged = mergeImports(existing.imports, generated.imports, [], "").join("\n");

    expect(merged).toBe('import { type Pet, PetSchema } from "./schemas";');
  });

  it("writes the merged import as the generator does, its names sorted and a long list over lines", () => {
    const names = ["PetSchema", "type Pet", "OwnerSchema", "type Owner", "NewPetSchema"];
    const statement = `import { ${names.join(", ")} } from "./schemas";`;
    const generated = parseExistingGroup(`${statement}\n${GROUP}`);

    const merged = mergeImports(generated.imports, generated.imports, [], "").join("\n");

    expect(merged).toBe(
      [
        "import {",
        "  NewPetSchema,",
        "  type Owner,",
        "  OwnerSchema,",
        "  type Pet,",
        "  PetSchema,",
        '} from "./schemas";',
      ].join("\n"),
    );
  });
});

describe("import shapes a group file may carry", () => {
  it("reads a list wrapped across lines", () => {
    const parsed = parseExistingGroup(`import {
  PetSchema,
  NewPetSchema,
  OwnerSchema,
} from "./schemas";
${GROUP}`);

    expect(parsed.imports).toHaveLength(1);
    expect(parsed.imports[0]?.source).toBe("./schemas");
    expect(parsed.imports[0]?.names).toEqual(["PetSchema", "NewPetSchema", "OwnerSchema"]);
  });

  it("keeps a default, a mixed and a side-effect import apart", () => {
    const parsed = parseExistingGroup(`import "./polyfill";
import dayjs from "dayjs";
import React, { useMemo } from "react";
import { z } from "zod";
${GROUP}`);

    expect(parsed.imports).toHaveLength(4);
    expect(new Set(parsed.imports.map((i) => i.source)).size).toBe(4);
  });

  it("carries every one of them through a merge", () => {
    const existing = parseExistingGroup(`import "./polyfill";
import dayjs from "dayjs";
import React, { useMemo } from "react";
import { z } from "zod";
${GROUP}`);
    const generated = parseExistingGroup(`import { z } from "zod";
${GROUP}`);

    const changes: MergeChange[] = [];
    const merged = mergeImports(existing.imports, generated.imports, changes, "").join("\n");

    expect(merged).toContain('import "./polyfill";');
    expect(merged).toContain('import dayjs from "dayjs";');
    expect(merged).toContain("import React, { useMemo }");
    expect(merged).toContain('from "zod"');
  });

  it("unions the names of a wrapped list with a generated one", () => {
    const existing = parseExistingGroup(`import {
  PetSchema,
  MyOwnSchema,
} from "./schemas";
${GROUP}`);
    const generated = parseExistingGroup(`import { PetSchema, NewPetSchema } from "./schemas";
${GROUP}`);

    const merged = mergeImports(
      existing.imports,
      generated.imports,
      [],
      "const mine = MyOwnSchema;",
    ).join("\n");

    for (const name of ["PetSchema", "NewPetSchema", "MyOwnSchema"]) {
      expect(merged).toContain(name);
    }
  });

  it("drops a name of a generated module that nothing merged uses any more", () => {
    const existing = parseExistingGroup(`import { InventorySchema, OrderSchema } from "./schemas";
${GROUP}`);
    const generated = parseExistingGroup(`import { InventorySchema } from "./schemas";
${GROUP}`);

    const merged = mergeImports(
      existing.imports,
      generated.imports,
      [],
      "endpoint.get('').response(InventorySchema)",
    ).join("\n");

    expect(merged).toContain('import { InventorySchema } from "./schemas";');
    expect(merged).not.toContain("OrderSchema");
  });
});

describe("imports read by their syntax", () => {
  it("reads an import that follows a blank line, and keeps it through a merge", () => {
    const existing =
      parseExistingGroup(`import { courier, defineGroup } from "@noverax/courier/define";

import { helper } from "../helper";
${GROUP}`);
    const generated =
      parseExistingGroup(`import { courier, defineGroup } from "@noverax/courier/define";
${GROUP}`);

    const merged = mergeImports(existing.imports, generated.imports, [], "").join("\n");

    expect(existing.imports.map((i) => i.source)).toEqual(["@noverax/courier/define", "../helper"]);
    expect(merged).toContain('import { helper } from "../helper";');
  });

  it("takes no import from a comment that reads like one", () => {
    const parsed = parseExistingGroup(`/*
import { ghost } from "./ghost";
*/
import { z } from "zod";
${GROUP}`);

    expect(parsed.imports.map((i) => i.source)).toEqual(["zod"]);
  });

  it("keeps no name alive that only a comment or a string mentions", () => {
    const existing = parseExistingGroup(`import { InventorySchema, OrderSchema } from "./schemas";
${GROUP}`);
    const generated = parseExistingGroup(`import { InventorySchema } from "./schemas";
${GROUP}`);
    const code = [
      "/** Returns an OrderSchema, as the description says. */",
      'endpoint.get("orders").response(InventorySchema).meta({ description: "OrderSchema" })',
    ].join("\n");

    const merged = mergeImports(existing.imports, generated.imports, [], code).join("\n");

    expect(merged).toBe('import { InventorySchema } from "./schemas";');
  });
});

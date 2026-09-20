import { describe, expect, it } from "vitest"
import { mergeImports } from "../src/apis/merge/merge-imports"
import { parseExistingGroup } from "../src/apis/merge/parse-existing"
import type { MergeChange } from "../src/apis/merge/types"

const GROUP = `
export const users = defineGroup({
  prefix: "/users",
  endpoints: {
    getAll: endpoint.get("").response<User[]>(),
  },
});
`

/**
 * Imports are merged by the module they name. An import the parser cannot read
 * has no module to merge on, so every one of them would key alike and all but
 * the last would be dropped.
 */
describe("import shapes a group file may carry", () => {
  it("reads a list wrapped across lines", () => {
    const parsed = parseExistingGroup(`import {
  PetSchema,
  NewPetSchema,
  OwnerSchema,
} from "./schemas";
${GROUP}`)

    expect(parsed.imports).toHaveLength(1)
    expect(parsed.imports[0]?.source).toBe("./schemas")
    expect(parsed.imports[0]?.names).toEqual(["PetSchema", "NewPetSchema", "OwnerSchema"])
  })

  it("keeps a default, a mixed and a side-effect import apart", () => {
    const parsed = parseExistingGroup(`import "./polyfill";
import dayjs from "dayjs";
import React, { useMemo } from "react";
import { z } from "zod";
${GROUP}`)

    expect(parsed.imports).toHaveLength(4)
    expect(new Set(parsed.imports.map((i) => i.source)).size).toBe(4)
  })

  it("carries every one of them through a merge", () => {
    const existing = parseExistingGroup(`import "./polyfill";
import dayjs from "dayjs";
import React, { useMemo } from "react";
import { z } from "zod";
${GROUP}`)
    const generated = parseExistingGroup(`import { z } from "zod";
${GROUP}`)

    const changes: MergeChange[] = []
    const merged = mergeImports(existing.imports, generated.imports, changes).join("\n")

    expect(merged).toContain('import "./polyfill";')
    expect(merged).toContain('import dayjs from "dayjs";')
    expect(merged).toContain("import React, { useMemo }")
    expect(merged).toContain('from "zod"')
  })

  it("unions the names of a wrapped list with a generated one", () => {
    const existing = parseExistingGroup(`import {
  PetSchema,
  MyOwnSchema,
} from "./schemas";
${GROUP}`)
    const generated = parseExistingGroup(`import { PetSchema, NewPetSchema } from "./schemas";
${GROUP}`)

    const merged = mergeImports(existing.imports, generated.imports, []).join("\n")

    for (const name of ["PetSchema", "NewPetSchema", "MyOwnSchema"]) {
      expect(merged).toContain(name)
    }
  })
})

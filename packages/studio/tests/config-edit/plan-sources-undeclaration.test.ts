/**
 * Taking an import out of the module courier.config takes its `sources`
 * from: its entry in the list, with its comment and comma, and the import
 * only that entry used — removed only as text, every other character as it
 * was, and left to the developer whenever the module builds its list in a
 * way Studio cannot change safely.
 */
import { describe, expect, it } from "vitest";
import { ConfigEditRefusal } from "../../src/server/config-edit/config-edit-refusal";
import {
  planSourcesUndeclaration,
  type SourcesUndeclarationInput,
} from "../../src/server/config-edit/plan-sources-undeclaration";

function input(
  text: string,
  overrides: Partial<SourcesUndeclarationInput> = {},
): SourcesUndeclarationInput {
  return { fileName: "lib/sources.ts", text, exportName: "sources", name: "pets", ...overrides };
}

function refusalOf(run: () => unknown): ConfigEditRefusal {
  try {
    run();
  } catch (error) {
    if (error instanceof ConfigEditRefusal) return error;
    throw error;
  }
  throw new Error("expected a refusal");
}

const LISTED =
  'import { api } from "./api";\nimport { pets } from "../src/api/pets/source";\n\nexport const sources = { api, pets };\n';

describe("planSourcesUndeclaration", () => {
  it("takes the entry and the import only it used out, as Studio added them", () => {
    const plan = planSourcesUndeclaration(input(LISTED));

    expect(plan?.text).toBe('import { api } from "./api";\n\nexport const sources = { api };\n');
    expect(plan?.edits.every((edit) => edit.text === "")).toBe(true);
  });

  it("takes a multi-line entry out with its doc comment, keeping the other entries' commas", () => {
    const text = [
      'import { api } from "./api";',
      'import { pets } from "../src/api/pets/source";',
      "",
      "export const sources = {",
      "  /** The pet store. */",
      "  pets,",
      "  api,",
      "};",
      "",
    ].join("\n");

    const plan = planSourcesUndeclaration(input(text));

    expect(plan?.text).toBe(
      'import { api } from "./api";\n\nexport const sources = {\n  api,\n};\n',
    );
  });

  it("leaves an empty list once the last entry goes", () => {
    const text =
      'import { pets } from "../src/api/pets/source";\n\nexport const sources = { pets };\n';

    const plan = planSourcesUndeclaration(input(text));

    expect(plan?.text).toBe("\nexport const sources = {};\n");
  });

  it("keeps an import another entry still uses", () => {
    const text =
      'import { pets } from "../src/api/pets/source";\n\nexport const sources = { pets, animals: pets };\n';

    const plan = planSourcesUndeclaration(input(text));

    expect(plan?.text).toBe(
      'import { pets } from "../src/api/pets/source";\n\nexport const sources = { animals: pets };\n',
    );
  });

  it("takes the entry out of a list exported by default, or behind satisfies", () => {
    const byDefault = planSourcesUndeclaration(
      input(
        'import { api } from "./api";\nimport { pets } from "../src/api/pets/source";\n\nexport default { api, pets };\n',
        { exportName: "default" },
      ),
    );
    const satisfied = planSourcesUndeclaration(
      input(LISTED.replace("{ api, pets };", "{ api, pets } satisfies object;")),
    );

    expect(byDefault?.text).toContain("export default { api };");
    expect(satisfied?.text).toContain("export const sources = { api } satisfies object;");
  });

  it("is nothing when the list does not name the import", () => {
    expect(
      planSourcesUndeclaration(
        input('import { api } from "./api";\nexport const sources = { api };\n'),
      ),
    ).toBeNull();
  });

  it("leaves a list built through a call to the developer", () => {
    const refusal = refusalOf(() =>
      planSourcesUndeclaration(input("const all = () => ({});\nexport const sources = all();\n")),
    );

    expect(refusal.code).toBe("LIST_SHAPE");
    expect(refusal.message).toBe(
      "lib/sources.ts builds `sources` through a call Studio cannot see into.",
    );
  });
});

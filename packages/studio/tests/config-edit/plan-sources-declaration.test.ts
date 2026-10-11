/**
 * Listing an import in the module courier.config takes its `sources` from:
 * the import line after the module's last import and the entry appended to
 * the list it exports, each written as the module writes its own, every
 * other character as it was — and left to the developer whenever the
 * module builds its list in a way Studio cannot change safely.
 */
import { describe, expect, it } from "vitest";
import { ConfigEditRefusal } from "../../src/server/config-edit/config-edit-refusal";
import {
  planSourcesDeclaration,
  type SourcesDeclarationInput,
} from "../../src/server/config-edit/plan-sources-declaration";

const SOURCE = { binding: "pets", specifier: "../src/api/pets/source" };

function input(
  text: string,
  overrides: Partial<SourcesDeclarationInput> = {},
): SourcesDeclarationInput {
  return {
    fileName: "lib/sources.ts",
    text,
    exportName: "sources",
    name: "pets",
    source: SOURCE,
    ...overrides,
  };
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

describe("planSourcesDeclaration", () => {
  it("imports the generated source and appends it to a one-line list", () => {
    const plan = planSourcesDeclaration(
      input('import { api } from "./api";\n\nexport const sources = { api };\n'),
    );

    expect(plan.text).toBe(
      'import { api } from "./api";\nimport { pets } from "../src/api/pets/source";\n\nexport const sources = { api, pets };\n',
    );
  });

  it("appends to a multi-line list as its entries are written, keeping its trailing comma", () => {
    const text =
      "import { api } from './api'\nimport { billing } from './billing'\n\nexport const sources = {\n\tapi,\n\tbilling,\n}\n";

    const plan = planSourcesDeclaration(input(text));

    expect(plan.text).toBe(
      "import { api } from './api'\nimport { billing } from './billing'\nimport { pets } from '../src/api/pets/source'\n\nexport const sources = {\n\tapi,\n\tbilling,\n\tpets,\n}\n",
    );
  });

  it("adds to the list behind satisfies or as, exported by a specifier or by default", () => {
    const satisfied = planSourcesDeclaration(
      input(
        'import { api } from "./api";\n\nconst all = { api } satisfies Record<string, unknown>;\n\nexport { all as sources };\n',
      ),
    );
    const byDefault = planSourcesDeclaration(
      input('import { api } from "./api";\n\nexport default { api } as const;\n', {
        exportName: "default",
      }),
    );

    expect(satisfied.text).toContain(
      "const all = { api, pets } satisfies Record<string, unknown>;",
    );
    expect(byDefault.text).toContain("export default { api, pets } as const;");
  });

  it("writes an entry under a key that is not an identifier as a quoted key", () => {
    const plan = planSourcesDeclaration(
      input('import { api } from "./api";\n\nexport const sources = { api };\n', {
        name: "pet-store",
        source: { binding: "petStore", specifier: "../src/api/pet-store/source" },
      }),
    );

    expect(plan.text).toContain('export const sources = { api, "pet-store": petStore };');
  });

  it("only adds text, and lists every insertion it makes", () => {
    const text = 'import { api } from "./api";\n\nexport const sources = { api };\n';

    const plan = planSourcesDeclaration(input(text));

    expect(plan.edits.every((edit) => edit.end === edit.start)).toBe(true);
    expect(plan.edits.reduce((sum, edit) => sum + edit.text.length, 0)).toBe(
      plan.text.length - text.length,
    );
  });

  it("leaves a list built through a call, or declared with let, to the developer", () => {
    const called = refusalOf(() =>
      planSourcesDeclaration(input("const all = () => ({});\nexport const sources = all();\n")),
    );
    const mutable = refusalOf(() => planSourcesDeclaration(input("export let sources = {};\n")));

    expect(called.code).toBe("LIST_SHAPE");
    expect(called.message).toBe(
      "lib/sources.ts builds `sources` through a call Studio cannot see into.",
    );
    expect(mutable.message).toBe("lib/sources.ts declares `sources` with let.");
  });

  it("leaves a module without the export, or that does not parse, to the developer", () => {
    const missing = refusalOf(() => planSourcesDeclaration(input("export const other = {};\n")));
    const broken = refusalOf(() => planSourcesDeclaration(input("export const sources = {\n")));

    expect(missing.message).toBe("lib/sources.ts exports no `sources`.");
    expect(broken.code).toBe("CONFIG_UNREADABLE");
  });

  it("refuses a name the list or the module uses already", () => {
    const listed = refusalOf(() =>
      planSourcesDeclaration(input("const pets = {};\nexport const sources = { pets };\n")),
    );
    const bound = refusalOf(() =>
      planSourcesDeclaration(
        input('import { pets } from "./old";\nexport const sources = {};\n', { name: "petstore" }),
      ),
    );

    expect(listed.code).toBe("NAME_IN_USE");
    expect(listed.message).toBe("lib/sources.ts lists pets already.");
    expect(bound.code).toBe("NAME_IN_USE");
  });
});

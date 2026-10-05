/**
 * Declaring an import in courier.config.ts: the generated source imported
 * after the config's imports, named under `sources`, and the import's entry
 * under `imports` — added only as text, in the config's own style, and left
 * to the developer whenever the config is written in a way Studio cannot
 * add to safely.
 */
import type { CourierImportEntry } from "@noverax/courier/config";
import { describe, expect, it } from "vitest";

import type { ConfigDeclarationInput } from "../../src/server/config-edit/config-declaration-types";
import { ConfigEditRefusal } from "../../src/server/config-edit/config-edit-refusal";
import { planConfigDeclaration } from "../../src/server/config-edit/plan-config-declaration";

const ENTRY: CourierImportEntry = {
  importType: "url",
  type: "openapi",
  from: "http://localhost:4610/billing.yaml",
  outputDir: "src/api",
  sourceName: "billing",
};

function input(
  text: string,
  overrides: Partial<ConfigDeclarationInput> = {},
): ConfigDeclarationInput {
  return {
    configName: "courier.config.ts",
    text,
    name: "billing",
    source: { binding: "billing", specifier: "./src/api/billing/source" },
    importEntry: ENTRY,
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

describe("declaring an import in the config", () => {
  it("imports the source after the last import, names it under sources and adds an imports key", () => {
    const text = [
      'import { defineConfig } from "@noverax/courier/config";',
      'import { api } from "./src/api";',
      "",
      "export default defineConfig({",
      "  sources: { api },",
      "});",
      "",
    ].join("\n");

    const plan = planConfigDeclaration(input(text));

    expect(plan.text).toBe(
      [
        'import { defineConfig } from "@noverax/courier/config";',
        'import { api } from "./src/api";',
        'import { billing } from "./src/api/billing/source";',
        "",
        "export default defineConfig({",
        "  sources: { api, billing },",
        "  imports: {",
        "    billing: {",
        '      importType: "url",',
        '      type: "openapi",',
        '      from: "http://localhost:4610/billing.yaml",',
        '      outputDir: "src/api",',
        '      sourceName: "billing",',
        "    },",
        "  },",
        "});",
        "",
      ].join("\n"),
    );
    expect(plan.edits.every((edit) => edit.start === edit.end)).toBe(true);
  });

  it("writes like the config: its quotes, semicolons, tabs and the lists it already has", () => {
    const text = [
      "import { api } from './src/api'",
      "",
      "const config = defineConfig({",
      "\tsources: {",
      "\t\tapi,",
      "\t},",
      "\timports: {",
      "\t\tother: { importType: 'file', type: 'openapi', outputDir: 'src/api' },",
      "\t},",
      "})",
      "",
      "export default config",
      "",
    ].join("\n");

    const plan = planConfigDeclaration(input(text));

    expect(plan.text).toBe(
      [
        "import { api } from './src/api'",
        "import { billing } from './src/api/billing/source'",
        "",
        "const config = defineConfig({",
        "\tsources: {",
        "\t\tapi,",
        "\t\tbilling,",
        "\t},",
        "\timports: {",
        "\t\tother: { importType: 'file', type: 'openapi', outputDir: 'src/api' },",
        "\t\tbilling: {",
        "\t\t\timportType: 'url',",
        "\t\t\ttype: 'openapi',",
        "\t\t\tfrom: 'http://localhost:4610/billing.yaml',",
        "\t\t\toutputDir: 'src/api',",
        "\t\t\tsourceName: 'billing',",
        "\t\t},",
        "\t},",
        "})",
        "",
        "export default config",
        "",
      ].join("\n"),
    );
  });

  it("keeps a one-line config on one line", () => {
    const text = 'import { api } from "./src/api";\n\nexport default { sources: { api } };\n';

    const plan = planConfigDeclaration(input(text, { importEntry: undefined }));

    expect(plan.text).toBe(
      'import { api } from "./src/api";\nimport { billing } from "./src/api/billing/source";\n\nexport default { sources: { api, billing } };\n',
    );
  });

  it("adds to the object a top-level const holds when the config names it under sources", () => {
    const text =
      'import { api } from "./src/api";\n\nconst sources = {\n  api,\n};\n\nexport default { sources };\n';

    const plan = planConfigDeclaration(input(text, { importEntry: undefined }));

    expect(plan.text).toContain("const sources = {\n  api,\n  billing,\n};");
    expect(plan.text).toContain("export default { sources };");
  });

  it("keys an import whose name is not an identifier in quotes, and names the source under it", () => {
    const text =
      'import { api } from "./src/api";\n\nexport default {\n  sources: {\n    api,\n  },\n};\n';

    const plan = planConfigDeclaration(
      input(text, {
        name: "billing-v2",
        source: { binding: "billingV2", specifier: "./src/api/billing-v2/source" },
        importEntry: undefined,
      }),
    );

    expect(plan.text).toContain('import { billingV2 } from "./src/api/billing-v2/source";');
    expect(plan.text).toContain('    api,\n    "billing-v2": billingV2,\n  },');
  });

  it("adds only the imports entry when sources declares the source already", () => {
    const text =
      'import { billing } from "./src/api/billing/source";\n\nexport default {\n  sources: { billing },\n};\n';

    const plan = planConfigDeclaration(input(text, { source: undefined }));

    expect(plan.text.match(/import \{ billing \}/g)).toHaveLength(1);
    expect(plan.text).toContain("  sources: { billing },\n  imports: {\n    billing: {\n");
  });
});

describe("leaving the declaration to the developer", () => {
  it.each([
    ["a config that does not parse", "export default {", "CONFIG_UNREADABLE"],
    ["a function as the default export", "export default function config() {}\n", "CONFIG_SHAPE"],
    ["no default export", "export const config = {};\n", "CONFIG_SHAPE"],
    ["sources built by a call", "export default { sources: load() };\n", "LIST_SHAPE"],
    ["sources that may come from a spread", "export default { ...base };\n", "LIST_SHAPE"],
    ["sources declared twice", "export default { sources: {}, sources: {} };\n", "LIST_SHAPE"],
    ["sources read from a let", "let sources = {};\nexport default { sources };\n", "LIST_SHAPE"],
    [
      "the source's name taken",
      'import { billing } from "./old";\nexport default { sources: {} };\n',
      "NAME_IN_USE",
    ],
  ])("refuses %s", (_case, text, code) => {
    const refusal = refusalOf(() => planConfigDeclaration(input(text)));

    expect(refusal.code).toBe(code);
    expect(refusal.message).toContain("courier.config.ts");
  });
});

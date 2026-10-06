/**
 * Taking an import out of courier.config.ts: its `sources` entry and the
 * import only that entry used, and its `imports` entry — removed only as
 * text, every other character as it was, and left to the developer
 * whenever the config is written in a way Studio cannot change safely.
 */
import { describe, expect, it } from "vitest";
import { ConfigEditRefusal } from "../../src/server/config-edit/config-edit-refusal";
import type { ConfigUndeclarationInput } from "../../src/server/config-edit/config-undeclaration-types";
import { planConfigUndeclaration } from "../../src/server/config-edit/plan-config-undeclaration";

function input(
  text: string,
  overrides: Partial<ConfigUndeclarationInput> = {},
): ConfigUndeclarationInput {
  return {
    configName: "courier.config.ts",
    text,
    name: "billing",
    source: true,
    importEntry: true,
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

/* The config as Studio leaves it once it declared `billing` next to `api`. */
const DECLARED = [
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
].join("\n");

const BEFORE = [
  'import { defineConfig } from "@noverax/courier/config";',
  'import { api } from "./src/api";',
  "",
  "export default defineConfig({",
  "  sources: { api },",
  "});",
  "",
].join("\n");

describe("taking an import out of the config", () => {
  it("leaves the config as it was before Studio declared the import", () => {
    const plan = planConfigUndeclaration(input(DECLARED));

    expect(plan?.text).toBe(BEFORE);
    expect(plan?.edits.every((edit) => edit.text === "")).toBe(true);
  });

  it("keeps the other entries of `imports`, and the key", () => {
    const text = DECLARED.replace(
      "  imports: {\n",
      '  imports: {\n    api: { importType: "raw", type: "openapi", outputDir: "src/api" },\n',
    );

    const plan = planConfigUndeclaration(input(text));

    expect(plan?.text).toContain(
      '  imports: {\n    api: { importType: "raw", type: "openapi", outputDir: "src/api" },\n  },\n',
    );
    expect(plan?.text).not.toContain("billing");
  });

  it("closes `sources` up to `{}` when the import was its only entry", () => {
    const text =
      'import { billing } from "./src/api/billing/source";\n\nexport default { sources: { billing } };\n';

    const plan = planConfigUndeclaration(input(text, { importEntry: false }));

    expect(plan?.text).toBe("\nexport default { sources: {} };\n");
  });

  it("takes a name out of an import that brings in others, and keeps the line", () => {
    const text =
      'import { api, billing } from "./src/api";\n\nexport default { sources: { api, billing } };\n';

    const plan = planConfigUndeclaration(input(text, { importEntry: false }));

    expect(plan?.text).toBe(
      'import { api } from "./src/api";\n\nexport default { sources: { api } };\n',
    );
  });

  it("keeps the import of a name the config uses elsewhere", () => {
    const text = [
      'import { billing } from "./src/api/billing/source";',
      "",
      "export default {",
      "  sources: { billing },",
      "  studio: { label: billing.baseURL },",
      "};",
      "",
    ].join("\n");

    const plan = planConfigUndeclaration(input(text, { importEntry: false }));

    expect(plan?.text).toContain('import { billing } from "./src/api/billing/source";');
    expect(plan?.text).toContain("  sources: {},\n");
  });

  it("takes an entry written under another name out, with that name's import", () => {
    const text = [
      'import { api } from "./src/api";',
      'import { billingSource } from "./src/api/billing/source";',
      "",
      "export default {",
      "  sources: {",
      "    api,",
      "    /** Billing, as imported. */",
      "    billing: billingSource,",
      "  },",
      "};",
      "",
    ].join("\n");

    const plan = planConfigUndeclaration(input(text, { importEntry: false }));

    expect(plan?.text).toBe(
      'import { api } from "./src/api";\n\nexport default {\n  sources: {\n    api,\n  },\n};\n',
    );
  });

  it("takes the entries out of lists a top-level const declares", () => {
    const text = [
      'import { api } from "./src/api";',
      'import { billing } from "./src/api/billing/source";',
      "",
      "const sources = { api, billing };",
      'const imports = { billing: { importType: "raw", type: "openapi", outputDir: "src/api" } };',
      "",
      "export default { sources, imports };",
      "",
    ].join("\n");

    const plan = planConfigUndeclaration(input(text));

    expect(plan?.text).toBe(
      'import { api } from "./src/api";\n\nconst sources = { api };\nconst imports = {};\n\nexport default { sources, imports };\n',
    );
  });

  it("takes only the `imports` entry when the source is another API's", () => {
    const plan = planConfigUndeclaration(input(DECLARED, { source: false }));

    expect(plan?.text).toContain("  sources: { api, billing },\n");
    expect(plan?.text).toContain('import { billing } from "./src/api/billing/source";');
    expect(plan?.text).not.toContain("imports");
  });

  it("plans nothing for a config that names the import nowhere", () => {
    expect(planConfigUndeclaration(input(BEFORE))).toBeNull();
  });

  it("leaves a config to the developer when its `sources` is built by a call", () => {
    const text = 'import { all } from "./src/api";\n\nexport default { sources: all() };\n';

    const refusal = refusalOf(() => planConfigUndeclaration(input(text)));

    expect(refusal.code).toBe("LIST_SHAPE");
    expect(refusal.message).toBe(
      "courier.config.ts builds `sources` in a way Studio cannot change.",
    );
  });

  it("leaves a config that does not parse to the developer", () => {
    const refusal = refusalOf(() => planConfigUndeclaration(input("export default {")));

    expect(refusal.code).toBe("CONFIG_UNREADABLE");
  });

  it("keeps the rest of a line an import shares with other code", () => {
    const text = 'import { billing } from "./b"; export default { sources: { billing } };\n';

    const plan = planConfigUndeclaration(input(text, { importEntry: false }));

    expect(plan?.text).toBe("export default { sources: {} };\n");
  });
});

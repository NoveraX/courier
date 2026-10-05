/**
 * Once Studio writes an import's files, the wizard says only that, and
 * shows what courier.config must still declare for the API to appear — the
 * import of the generated source, its entry under sources and the imports
 * entry — as Studio answered the write.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/design/code/code-lines", async () => {
  const { createElement } = await import("react");
  return { CodeLines: ({ code }: { code: string }) => createElement("pre", null, code) };
});

import { settleWrite } from "@/features/apis/settle-write";
import type { ImportDeclaration, ImportState } from "@/features/apis/types";
import { DeclareStep } from "@/screens/apis/import/declare-step";

const IMPORT_ENTRY = [
  '  "pets": {',
  '    importType: "url",',
  '    type: "openapi",',
  '    from: "https://specs.example/pets.json",',
  '    outputDir: "src/api",',
  '    sourceName: "pets",',
  "  },",
].join("\n");

const SOURCE = { importLine: 'import { pets } from "./src/api/pets/source";', entry: "pets," };

const PREVIEWED: ImportState = {
  step: "preview",
  source: "url",
  content: "https://specs.example/pets.json",
  spec: null,
  options: {
    sourceName: "pets",
    outputDir: "src/api",
    validation: "zod",
    groupBy: "tag",
    generateTypes: true,
    generateSchemas: true,
    addAuthMiddleware: false,
    includeComments: true,
    generateClient: "direct",
    selectedEndpoints: null,
  },
  selectedEndpoints: { pets: ["listPets"] },
  generatedFiles: [
    { path: "src/api/pets/source.ts", content: "" },
    { path: "src/api/pets/index.ts", content: "" },
  ],
  writing: false,
  declaration: null,
  consent: null,
};

/* Studio's answer to the write, as the route sends it. */
function answer(declaration?: unknown): Record<string, unknown> {
  return {
    written: ["src/api/pets/source.ts", "src/api/pets/index.ts"],
    removed: [],
    kept: [],
    backupDir: ".courier/backups/1-a",
    pruneFailures: [],
    leftBehind: [],
    ...(declaration === undefined ? {} : { declaration }),
  };
}

function text(html: string): string {
  return html.replaceAll("&quot;", '"').replaceAll("&#x27;", "'");
}

describe("the wizard once Studio wrote an import's files", () => {
  it("moves to the declare step with what the config must still declare", () => {
    const { state, message } = settleWrite(
      PREVIEWED,
      answer({ configFile: "courier.config.ts", source: SOURCE, importEntry: IMPORT_ENTRY }),
    );

    expect(state.step).toBe("declare");
    expect(state.declaration).toEqual({
      configFile: "courier.config.ts",
      source: SOURCE,
      importEntry: IMPORT_ENTRY,
      leftOut: 0,
    });
    expect(message).toBe("pets: wrote 2 files");
  });

  it("says only what was written, never that the API was imported", () => {
    const { message } = settleWrite(
      PREVIEWED,
      answer({ configFile: "courier.config.ts", source: SOURCE }),
    );

    expect(message).not.toMatch(/import/i);
    expect(settleWrite(PREVIEWED, { written: ["src/api/pets/source.ts"] }).message).toBe(
      "pets: wrote 1 file",
    );
  });

  it("says what it removed, kept and left behind besides what it wrote", () => {
    const reply = {
      ...answer(),
      removed: ["src/api/pets/old/index.ts"],
      kept: [{ path: "src/api/pets/helpers.ts", reason: "not-written-by-studio" }],
      leftBehind: ["src/gen/pets/source.ts", "src/gen/pets/index.ts"],
    };

    expect(settleWrite(PREVIEWED, reply).message).toBe(
      "pets: wrote 2 files; removed 1 file, keeping a copy; left 1 file as it was; left 2 files in its previous directory",
    );
  });

  it("says the files are already as generated when it wrote and removed nothing", () => {
    const reply = { ...answer(), written: [] };

    expect(settleWrite(PREVIEWED, reply).message).toBe("pets is already as Studio generates it");
  });

  it("has nothing left to show once the config declares everything", () => {
    const { state } = settleWrite(PREVIEWED, answer());

    expect(state.step).toBe("preview");
    expect(state.declaration).toBeNull();
  });

  it("keeps the parts Studio named, and drops the malformed ones", () => {
    const onlyEntry = settleWrite(
      PREVIEWED,
      answer({
        configFile: "courier.config.ts",
        source: { importLine: 1 },
        importEntry: IMPORT_ENTRY,
      }),
    );
    const nothing = settleWrite(
      PREVIEWED,
      answer({ configFile: "courier.config.ts", source: "pets,", importEntry: 7 }),
    );

    expect(onlyEntry.state.declaration).toEqual({
      configFile: "courier.config.ts",
      source: null,
      importEntry: IMPORT_ENTRY,
      leftOut: 0,
    });
    expect(nothing.state.step).toBe("preview");
    expect(nothing.state.declaration).toBeNull();
  });

  it("keeps the count of endpoints left out, and reads a malformed count as none", () => {
    const counted = settleWrite(
      PREVIEWED,
      answer({ configFile: "courier.config.ts", importEntry: IMPORT_ENTRY, leftOut: 3 }),
    );
    const malformed = settleWrite(
      PREVIEWED,
      answer({ configFile: "courier.config.ts", importEntry: IMPORT_ENTRY, leftOut: -2 }),
    );

    expect(counted.state.declaration).toHaveProperty("leftOut", 3);
    expect(malformed.state.declaration).toHaveProperty("leftOut", 0);
  });

  it("drops the plan a refused write showed, once the write went through", () => {
    const refused: ImportState = {
      ...PREVIEWED,
      consent: {
        plan: {
          digest: "d",
          dir: "src/api/pets",
          writes: [],
          removals: [],
          kept: [],
          pending: [],
          blocked: [],
          forgotten: [],
        },
        confirmed: [],
      },
    };

    expect(settleWrite(refused, answer()).state.consent).toBeNull();
  });
});

describe("the declare step", () => {
  it("shows the source to import and list, and the imports entry, and says the API appears once declared", () => {
    const declaration: ImportDeclaration = {
      configFile: "courier.config.ts",
      source: SOURCE,
      importEntry: IMPORT_ENTRY,
      leftOut: 0,
    };

    const html = text(
      renderToStaticMarkup(<DeclareStep sourceName="pets" declaration={declaration} />),
    );

    expect(html).toContain(`<pre>${SOURCE.importLine}</pre>`);
    expect(html).toContain("<pre>pets,</pre>");
    expect(html).toContain(`<pre>${IMPORT_ENTRY}</pre>`);
    expect(html).toContain("left courier.config.ts as it is");
    expect(html).toContain("pets appears in Studio");
    expect(html).toContain("once courier.config.ts declares it under sources");
    expect(html).not.toContain("out in Select");
    expect(html).not.toContain("cannot keep that selection");
  });

  it("says the imports entry does not keep the endpoints left out in Select, which an update generates", () => {
    const declaration: ImportDeclaration = {
      configFile: "courier.config.ts",
      source: SOURCE,
      importEntry: IMPORT_ENTRY,
      leftOut: 2,
    };

    const html = text(
      renderToStaticMarkup(<DeclareStep sourceName="pets" declaration={declaration} />),
    );

    expect(html).toContain(`<pre>${IMPORT_ENTRY}</pre>`);
    expect(html).toContain(
      "You left 2 endpoints out in Select. The imports entry cannot keep that selection, so Manage lists those as endpoints you can add.",
    );
  });

  it("shows only the imports entry while the config lists the source already", () => {
    const declaration: ImportDeclaration = {
      configFile: "courier.config.ts",
      source: null,
      importEntry: IMPORT_ENTRY,
      leftOut: 0,
    };

    const html = text(
      renderToStaticMarkup(<DeclareStep sourceName="pets" declaration={declaration} />),
    );

    expect(html).toContain(`<pre>${IMPORT_ENTRY}</pre>`);
    expect(html).toContain("courier.config.ts lists pets under sources already");
    expect(html).not.toContain(SOURCE.importLine);
  });
});

/**
 * Once Studio writes an import's files, the wizard says only that, and
 * shows what courier.config must still declare for the API to appear — the
 * import of the generated source, its entry under sources and the imports
 * entry — as Studio answered the write. The APIs page's empty state says
 * what makes an API appear.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/shared/code-block", async () => {
  const { createElement } = await import("react");
  return { CodeBlock: ({ code }: { code: string }) => createElement("pre", null, code) };
});

import type { ImportDeclaration, ImportState } from "../src/views/apis/types";

import { ApisEmptyState } from "../src/views/apis/apis-empty-state";
import { DeclareStepView } from "../src/views/apis/declare-step";
import { settleWrite } from "../src/views/apis/settle-write";

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
};

/* Studio's answer to the write, as the route sends it. */
function answer(declaration?: unknown): Record<string, unknown> {
  return {
    written: 2,
    merged: 0,
    files: [
      { path: "src/api/pets/source.ts", status: "safe" },
      { path: "src/api/pets/index.ts", status: "safe" },
    ],
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
      nameTaken: null,
    });
    expect(message).toBe("Wrote 2 files for pets");
  });

  it("says only what was written, never that the API was imported", () => {
    const { message } = settleWrite(PREVIEWED, answer({ configFile: "courier.config.ts", source: SOURCE }));

    expect(message).not.toMatch(/import/i);
    expect(settleWrite(PREVIEWED, { written: 1 }).message).toBe("Wrote 1 file for pets");
  });

  it("has nothing left to show once the config declares everything", () => {
    const { state } = settleWrite(PREVIEWED, answer());

    expect(state.step).toBe("preview");
    expect(state.declaration).toBeNull();
  });

  it("keeps the parts Studio named, and drops the malformed ones", () => {
    const onlyEntry = settleWrite(
      PREVIEWED,
      answer({ configFile: "courier.config.ts", source: { importLine: 1 }, importEntry: IMPORT_ENTRY }),
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
      nameTaken: null,
    });
    expect(nothing.state.step).toBe("preview");
    expect(nothing.state.declaration).toBeNull();
  });

  it("keeps the count of endpoints left out, and a taken name even with no part to declare", () => {
    const counted = settleWrite(
      PREVIEWED,
      answer({ configFile: "courier.config.ts", importEntry: IMPORT_ENTRY, leftOut: 3 }),
    );
    const taken = settleWrite(
      PREVIEWED,
      answer({ configFile: "courier.config.ts", nameTaken: { sourceFile: "src/api/pets/source.ts" } }),
    );
    const malformed = settleWrite(
      PREVIEWED,
      answer({ configFile: "courier.config.ts", importEntry: IMPORT_ENTRY, leftOut: -2, nameTaken: { sourceFile: 4 } }),
    );

    expect(counted.state.declaration).toHaveProperty("leftOut", 3);
    expect(taken.state.step).toBe("declare");
    expect(taken.state.declaration).toEqual({
      configFile: "courier.config.ts",
      source: null,
      importEntry: null,
      leftOut: 0,
      nameTaken: { sourceFile: "src/api/pets/source.ts" },
    });
    expect(malformed.state.declaration).toHaveProperty("leftOut", 0);
    expect(malformed.state.declaration).toHaveProperty("nameTaken", null);
  });
});

describe("the declare step", () => {
  it("shows the source to import and list, and the imports entry, and says the API appears once declared", () => {
    const declaration: ImportDeclaration = {
      configFile: "courier.config.ts",
      source: SOURCE,
      importEntry: IMPORT_ENTRY,
      leftOut: 0,
      nameTaken: null,
    };

    const html = text(renderToStaticMarkup(<DeclareStepView sourceName="pets" declaration={declaration} />));

    expect(html).toContain(`<pre>${SOURCE.importLine}</pre>`);
    expect(html).toContain("<pre>pets,</pre>");
    expect(html).toContain(`<pre>${IMPORT_ENTRY}</pre>`);
    expect(html).toContain("left courier.config.ts as it is");
    expect(html).toContain("pets appears in Studio");
    expect(html).toContain("once courier.config.ts declares it under sources");
    expect(html).not.toContain("left 0");
    expect(html).not.toContain("cannot keep that selection");
  });

  it("says the imports entry does not keep the endpoints left out in Select, which an update generates", () => {
    const declaration: ImportDeclaration = {
      configFile: "courier.config.ts",
      source: SOURCE,
      importEntry: IMPORT_ENTRY,
      leftOut: 2,
      nameTaken: null,
    };

    const html = text(renderToStaticMarkup(<DeclareStepView sourceName="pets" declaration={declaration} />));

    expect(html).toContain(`<pre>${IMPORT_ENTRY}</pre>`);
    expect(html).toContain(
      "You left 2 endpoints out in Select. The imports entry cannot keep that selection, so an update generates every endpoint in the specification, those included.",
    );
  });

  it("says the name is another API's, and offers nothing to paste, while sources declares another API under it", () => {
    const declaration: ImportDeclaration = {
      configFile: "courier.config.ts",
      source: null,
      importEntry: null,
      leftOut: 0,
      nameTaken: { sourceFile: "src/api/api/source.ts" },
    };

    const html = text(renderToStaticMarkup(<DeclareStepView sourceName="api" declaration={declaration} />));

    expect(html).toContain("courier.config.ts declares a source named api already");
    expect(html).toContain("does not import the one Studio generated at src/api/api/source.ts");
    expect(html).toContain("import this specification again under a name no source there takes");
    expect(html).not.toContain("lists api under sources already");
    expect(html).not.toContain("<pre>");
  });

  it("shows only the imports entry while the config lists the source already", () => {
    const declaration: ImportDeclaration = {
      configFile: "courier.config.ts",
      source: null,
      importEntry: IMPORT_ENTRY,
      leftOut: 0,
      nameTaken: null,
    };

    const html = text(renderToStaticMarkup(<DeclareStepView sourceName="pets" declaration={declaration} />));

    expect(html).toContain(`<pre>${IMPORT_ENTRY}</pre>`);
    expect(html).toContain("courier.config.ts lists pets under sources already");
    expect(html).not.toContain(SOURCE.importLine);
  });
});

describe("the APIs page with no sources", () => {
  it("says Studio lists the APIs courier.config declares under sources, and nothing else", () => {
    const html = text(renderToStaticMarkup(<ApisEmptyState />));

    expect(html).toContain("No APIs yet");
    expect(html).toContain("Studio lists the APIs courier.config declares under sources.");
    expect(html).toContain("then declare it there");
    expect(html).not.toContain("automatically");
  });
});

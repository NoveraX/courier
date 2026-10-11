/**
 * Once Studio writes an import's files, the wizard says only that, and
 * offers to declare the API in courier.config: the lines Studio adds, for
 * one click, then the API in Studio — or, when Studio cannot make the
 * change, the lines to add by hand and why.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/design/code/code-lines", async () => {
  const { createElement } = await import("react");
  return { CodeLines: ({ code }: { code: string }) => createElement("pre", null, code) };
});

import type { UseConfigDeclare } from "@/apis/use-config-declare";
import type { UseImportReturn } from "@/apis/use-import";
import { type ConfigDeclare, readConfigDeclare } from "@/features/apis/config-declare";
import { settleWrite } from "@/features/apis/settle-write";
import type { ImportDeclaration, ImportState } from "@/features/apis/types";
import type { DiffHunk } from "@/features/mocks/wizard/wire-types";
import { DeclareStep } from "@/screens/apis/import/declare-step";
import { ImportFooter } from "@/screens/apis/import/import-footer";

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
  fromTraffic: false,
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
      sourcesFile: null,
      source: SOURCE,
      importEntry: IMPORT_ENTRY,
      leftOut: 0,
    });
    expect(message).toBe("pets: wrote 2 files");
  });

  it("keeps the module the config takes its sources from, where the source is listed", () => {
    const { state } = settleWrite(
      PREVIEWED,
      answer({
        configFile: "courier.config.ts",
        sourcesFile: "lib/sources.ts",
        source: SOURCE,
        importEntry: IMPORT_ENTRY,
      }),
    );
    const blank = settleWrite(
      PREVIEWED,
      answer({ configFile: "courier.config.ts", sourcesFile: "", source: SOURCE }),
    );

    expect(state.declaration).toHaveProperty("sourcesFile", "lib/sources.ts");
    expect(blank.state.declaration).toHaveProperty("sourcesFile", null);
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
      sourcesFile: null,
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

const DECLARATION: ImportDeclaration = {
  configFile: "courier.config.ts",
  sourcesFile: null,
  source: SOURCE,
  importEntry: IMPORT_ENTRY,
  leftOut: 0,
};

const HUNKS: DiffHunk[] = [
  {
    lines: [
      { kind: "context", text: 'import { api } from "./src/api";', oldLine: 1, newLine: 1 },
      { kind: "add", text: SOURCE.importLine, oldLine: null, newLine: 2 },
      { kind: "context", text: "", oldLine: 2, newLine: 3 },
    ],
  },
];

const READY: ConfigDeclare = {
  status: "ready",
  configFile: "courier.config.ts",
  files: [{ file: "courier.config.ts", hunks: HUNKS }],
  baseHash: "base",
  stale: false,
};

function declareOf(
  answer: ConfigDeclare | null,
  overrides: Partial<UseConfigDeclare> = {},
): UseConfigDeclare {
  return { answer, error: null, applying: false, apply: vi.fn(async () => {}), ...overrides };
}

function step(declare: UseConfigDeclare, declaration = DECLARATION): string {
  return text(
    renderToStaticMarkup(
      <DeclareStep sourceName="pets" declaration={declaration} declare={declare} />,
    ),
  );
}

describe("the declare step", () => {
  it("shows the lines Studio adds to the config, and that it changes nothing else", () => {
    const html = step(declareOf(READY));

    expect(html).toContain("Files written — add");
    expect(html).toContain('aria-label="Change to courier.config.ts"');
    expect(html).toContain(SOURCE.importLine);
    expect(html).toContain("Studio adds these lines and changes nothing else in the file.");
    expect(html).not.toContain("by hand");
  });

  it("says the config changed since Studio read it when the change is shown again", () => {
    const html = step(declareOf({ ...READY, stale: true }));

    expect(html).toContain("courier.config.ts changed since Studio read it");
  });

  it("says the API is in Studio once the change is made", () => {
    const html = step(declareOf({ status: "applied", files: ["courier.config.ts"] }));

    expect(html).toContain("is in Studio");
    expect(html).toContain("Studio added it to courier.config.ts and loaded the config");
  });

  it("leaves the lines to add by hand, and why, when Studio cannot make the change", () => {
    const reason = "courier.config.ts builds `sources` in a way Studio cannot add to.";

    const html = step(
      declareOf({ status: "manual", code: "LIST_SHAPE", reason, declaration: DECLARATION }),
    );

    expect(html).toContain("in courier.config by hand");
    expect(html).toContain(reason);
    expect(html).toContain(`<pre>${SOURCE.importLine}</pre>`);
    expect(html).toContain("<pre>pets,</pre>");
    expect(html).toContain(`<pre>${IMPORT_ENTRY}</pre>`);
  });

  it("says the imports entry does not keep the endpoints left out in Select", () => {
    const html = step(declareOf(READY), { ...DECLARATION, leftOut: 2 });

    expect(html).toContain(
      "You left 2 endpoints out in Select. The imports entry cannot keep that selection, so Manage lists those as endpoints you can add.",
    );
  });

  it("shows the lines from the write when asking Studio failed", () => {
    const html = step(declareOf(null, { error: "Studio could not be reached." }));

    expect(html).toContain("Studio could not be reached.");
    expect(html).toContain(`<pre>${SOURCE.importLine}</pre>`);
  });

  it("says it is reading the config while the change is on its way", () => {
    expect(step(declareOf(null))).toContain("Reading courier.config.ts…");
  });

  it("shows the change to each file when the config takes its sources from a module", () => {
    const declaration = { ...DECLARATION, sourcesFile: "lib/sources.ts" };
    const twoFiles: ConfigDeclare = {
      ...READY,
      files: [
        { file: "lib/sources.ts", hunks: HUNKS },
        { file: "courier.config.ts", hunks: HUNKS },
      ],
    };

    const html = step(declareOf(twoFiles), declaration);
    const stale = step(declareOf({ ...twoFiles, stale: true }), declaration);

    expect(html).toContain(
      'add <span class="font-mono">pets</span> to lib/sources.ts and courier.config.ts</h3>',
    );
    expect(html).toContain('aria-label="Change to lib/sources.ts"');
    expect(html).toContain('aria-label="Change to courier.config.ts"');
    expect(html).toContain('title="courier.config.ts"');
    expect(html).toContain(
      "The config takes its sources from lib/sources.ts, so the API is listed there and the import declared in courier.config.ts. Studio writes both files or neither, and changes nothing else in them.",
    );
    expect(stale).toContain(
      "lib/sources.ts or courier.config.ts changed since Studio read them; this is the change against them now.",
    );
  });

  it("says which files Studio added the API to once the change is made", () => {
    const html = step(
      declareOf({ status: "applied", files: ["lib/sources.ts", "courier.config.ts"] }),
    );

    expect(html).toContain(
      "Studio added it to lib/sources.ts and courier.config.ts and loaded the config",
    );
  });

  it("names the file each line goes in when the lines are left to add by hand", () => {
    const declaration = { ...DECLARATION, sourcesFile: "lib/sources.ts" };

    const html = step(
      declareOf({ status: "manual", code: "WRITE_FAILED", reason: "No write.", declaration }),
    );

    expect(html).toContain(
      "In lib/sources.ts, which the config takes its sources from, import the generated source at the top of the file:",
    );
    expect(html).toContain("Add it to the sources lib/sources.ts exports:");
    expect(html).toContain("In courier.config.ts, declare the import under imports");
  });
});

describe("Studio's answer about declaring an import", () => {
  it("reads an apply that found the config saved meanwhile as the change against it now", () => {
    const raw = {
      status: "stale",
      preview: {
        status: "ready",
        configFile: "courier.config.ts",
        files: [{ file: "courier.config.ts", hunks: HUNKS }],
        baseHash: "new",
      },
    };

    expect(readConfigDeclare(raw)).toEqual({ ...READY, baseHash: "new", stale: true });
  });

  it("reads nothing from an answer it does not recognise", () => {
    const ready = { status: "ready", configFile: "courier.config.ts", baseHash: "h" };

    expect(readConfigDeclare(ready)).toBeNull();
    expect(readConfigDeclare({ ...ready, files: [] })).toBeNull();
    expect(readConfigDeclare({ ...ready, files: [{ file: "", hunks: [] }] })).toBeNull();
    expect(readConfigDeclare({ ...ready, files: [{ file: "a.ts", hunks: [7] }] })).toBeNull();
    expect(readConfigDeclare({ status: "applied" })).toBeNull();
    expect(readConfigDeclare({ status: "applied", files: [] })).toBeNull();
    expect(readConfigDeclare({ status: "applied", files: ["a.ts", 7] })).toBeNull();
    expect(readConfigDeclare("applied")).toBeNull();
  });
});

function wizardOn(state: ImportState): UseImportReturn {
  const action = vi.fn(async () => {});
  return {
    state,
    parsing: false,
    error: null,
    open: true,
    openWizard: vi.fn(),
    close: vi.fn(),
    setSource: vi.fn(),
    setContent: vi.fn(),
    parse: action,
    toggleEndpoint: vi.fn(),
    toggleGroup: vi.fn(),
    toggleAll: vi.fn(),
    setOptions: vi.fn(),
    preview: action,
    write: action,
    toggleConfirmed: vi.fn(),
    goToStep: vi.fn(),
  };
}

describe("the declare step's footer", () => {
  const declared = wizardOn({ ...PREVIEWED, step: "declare", declaration: DECLARATION });

  it("offers to add the import to the config while Studio offers the change", () => {
    const html = renderToStaticMarkup(
      <ImportFooter wizard={declared} declare={declareOf(READY)} />,
    );

    expect(html).toContain("Add to courier.config.ts");
    expect(html).toContain("Not now");
  });

  it("offers only Done once the change is made, or when it is left to the developer", () => {
    for (const answer of [
      { status: "applied", files: ["courier.config.ts"] },
      { status: "manual", code: "LIST_SHAPE", reason: "", declaration: null },
    ] satisfies ConfigDeclare[]) {
      const html = renderToStaticMarkup(
        <ImportFooter wizard={declared} declare={declareOf(answer)} />,
      );

      expect(html).toContain("Done");
      expect(html).not.toContain("Add to");
    }
  });
});

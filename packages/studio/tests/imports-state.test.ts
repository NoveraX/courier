import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeSpecHash,
  hasSpecChanged,
  IMPORTS_STATE_VERSION,
  type ImportStateEntry,
  type ImportsState,
  loadImportsState,
  readImportsState,
  recordImport,
  removeImport,
  resolveImportsStatePath,
  saveImportsState,
} from "../src/apis/imports-state";
import { saveJournal } from "../src/server/import-files/apply-journal";
import { saveImportEntry } from "../src/server/import-files/save-import-entry";

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), "courier-imports-state-"));
});

afterEach(() => {
  if (projectRoot && existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true });
});

const IS_WINDOWS = process.platform === "win32";
const IS_ROOT = process.getuid?.() === 0;
const HASH = "a".repeat(64);

function makeEntry(specHash: string): ImportStateEntry {
  return {
    specHash,
    fetchedAt: "2026-04-08T12:00:00.000Z",
    lastSyncedAt: "2026-04-08T12:00:01.000Z",
    dir: "src/api/github",
    files: { "src/api/github/index.ts": { sha256: HASH } },
  };
}

function writeState(content: unknown): string {
  const path = resolveImportsStatePath(projectRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
  return path;
}

describe("loadImportsState", () => {
  it("returns empty state when file is missing", () => {
    const state = loadImportsState(projectRoot);
    expect(state.version).toBe(IMPORTS_STATE_VERSION);
    expect(state.imports).toEqual({});
  });

  it("returns empty state when JSON is malformed", () => {
    const path = resolveImportsStatePath(projectRoot);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "{not json");
    const state = loadImportsState(projectRoot);
    expect(state.imports).toEqual({});
  });

  it("returns empty state when version mismatches", () => {
    const path = resolveImportsStatePath(projectRoot);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ version: 999, imports: {} }));
    const state = loadImportsState(projectRoot);
    expect(state.imports).toEqual({});
  });
});

describe("saveImportsState (atomic)", () => {
  it("writes the file and round-trips", () => {
    const initial: ImportsState = {
      version: IMPORTS_STATE_VERSION,
      applied: [],
      imports: { github: makeEntry("abc123") },
    };
    saveImportsState(projectRoot, initial);
    const reloaded = loadImportsState(projectRoot);
    expect(reloaded).toEqual(initial);
  });

  it("does not leave .tmp.* files behind on success", () => {
    saveImportsState(projectRoot, { version: IMPORTS_STATE_VERSION, imports: {}, applied: [] });
    const dir = join(projectRoot, ".courier");
    const files = readdirSync(dir);
    expect(files.some((f) => f.includes(".tmp."))).toBe(false);
  });
});

describe("recordImport / removeImport", () => {
  it("recordImport inserts a new entry", () => {
    const state = recordImport(
      { version: IMPORTS_STATE_VERSION, imports: {}, applied: [] },
      "github",
      makeEntry("abc"),
    );
    expect(state.imports.github?.specHash).toBe("abc");
  });

  it("recordImport replaces an existing entry", () => {
    const initial = recordImport(
      { version: IMPORTS_STATE_VERSION, imports: {}, applied: [] },
      "github",
      makeEntry("abc"),
    );
    const next = recordImport(initial, "github", makeEntry("def"));
    expect(next.imports.github?.specHash).toBe("def");
  });

  it("removeImport drops the entry", () => {
    const initial = recordImport(
      { version: IMPORTS_STATE_VERSION, imports: {}, applied: [] },
      "github",
      makeEntry("abc"),
    );
    const next = removeImport(initial, "github");
    expect(next.imports).toEqual({});
  });

  it("removeImport is a no-op when entry is missing", () => {
    const state: ImportsState = { version: IMPORTS_STATE_VERSION, imports: {}, applied: [] };
    expect(removeImport(state, "missing")).toBe(state);
  });
});

describe("hasSpecChanged", () => {
  const state = recordImport(
    { version: IMPORTS_STATE_VERSION, imports: {}, applied: [] },
    "github",
    makeEntry("abc"),
  );

  it("returns true for unknown imports", () => {
    expect(hasSpecChanged(state, "missing", "abc")).toBe(true);
  });

  it("returns false when hash matches", () => {
    expect(hasSpecChanged(state, "github", "abc")).toBe(false);
  });

  it("returns true when hash differs", () => {
    expect(hasSpecChanged(state, "github", "xyz")).toBe(true);
  });
});

describe("digest field", () => {
  const digest = {
    _kind: "digest" as const,
    groups: [],
    schemas: {},
  };

  it("recordImport round-trips an entry with digest set", () => {
    const entry: ImportStateEntry = { ...makeEntry("abc"), digest };
    const state = recordImport({ version: IMPORTS_STATE_VERSION, imports: {}, applied: [] }, "github", entry);
    expect(state.imports.github?.digest).toEqual(digest);
  });

  it("loadImportsState after saveImportsState preserves digest", () => {
    const entry: ImportStateEntry = { ...makeEntry("abc"), digest };
    saveImportsState(projectRoot, {
      version: IMPORTS_STATE_VERSION,
      applied: [],
      imports: { github: entry },
    });
    const reloaded = loadImportsState(projectRoot);
    expect(reloaded.imports.github?.digest).toEqual(digest);
  });

  it("removeImport does not touch other entries' digest", () => {
    const withTwo: ImportsState = {
      version: IMPORTS_STATE_VERSION,
      applied: [],
      imports: {
        github: { ...makeEntry("a"), digest },
        other: makeEntry("b"),
      },
    };
    const next = removeImport(withTwo, "other");
    expect(next.imports.github?.digest).toEqual(digest);
  });
});

describe("loadImportsState — backup and validation", () => {
  it("creates .corrupt backup when JSON is malformed", () => {
    const path = resolveImportsStatePath(projectRoot);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "{broken json!!!");
    loadImportsState(projectRoot);
    expect(existsSync(`${path}.corrupt`)).toBe(true);
  });

  it("keeps a new corrupt state beside an older copy, once however often it is read", () => {
    const path = writeState("{broken json!!!");
    writeFileSync(`${path}.corrupt`, "the first corrupt state");

    loadImportsState(projectRoot);
    loadImportsState(projectRoot);

    const copies = readdirSync(dirname(path)).filter((name) => name.startsWith("imports-state.json.corrupt"));
    expect(readFileSync(`${path}.corrupt`, "utf8")).toBe("the first corrupt state");
    expect(copies).toHaveLength(2);
    expect(copies.map((name) => readFileSync(join(dirname(path), name), "utf8"))).toContain("{broken json!!!");
  });

  it("keeps a state of another shape aside as invalid", () => {
    const path = writeState({ version: IMPORTS_STATE_VERSION, sources: {} });

    const { state, intact } = readImportsState(projectRoot);

    expect(state.imports).toEqual({});
    expect(intact).toBe(true);
    expect(readFileSync(`${path}.invalid`, "utf8")).toContain('"sources"');
  });

  it.skipIf(IS_WINDOWS || IS_ROOT)("says the state was corrupt even when its copy cannot be written", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const path = writeState("{broken json!!!");
    chmodSync(dirname(path), 0o555);
    let read: ReturnType<typeof readImportsState>;
    try {
      read = readImportsState(projectRoot);
    } finally {
      chmodSync(dirname(path), 0o755);
    }

    const lines = warn.mock.calls.map((call) => String(call[1]));
    expect(read.state.imports).toEqual({});
    expect(read.intact).toBe(false);
    expect(lines.some((line) => line.includes("Corrupt imports-state JSON"))).toBe(true);
    expect(lines.some((line) => line.includes("Could not save the previous imports-state"))).toBe(true);
    warn.mockRestore();
  });

  it("keeps a state of another version aside and starts from an empty one", () => {
    const earlier = { version: 1, imports: { github: { specHash: "x", generatedFiles: [] } } };
    const path = writeState(earlier);

    const state = loadImportsState(projectRoot);

    expect(state.imports).toEqual({});
    expect(JSON.parse(readFileSync(`${path}.v1`, "utf8"))).toEqual(earlier);
  });

  it("drops entries that do not have the shape, and keeps the state they came in aside", () => {
    const path = writeState({
      version: IMPORTS_STATE_VERSION,
      applied: [],
      imports: {
        valid: makeEntry("abc"),
        missing: { specHash: 123 },
        outside: { ...makeEntry("abc"), files: { "src/other/index.ts": { sha256: HASH } } },
        climbing: { ...makeEntry("abc"), files: { "src/api/github/../../../x.ts": { sha256: HASH } } },
        shortHash: { ...makeEntry("abc"), files: { "src/api/github/index.ts": { sha256: "abc" } } },
      },
    });

    const state = loadImportsState(projectRoot);

    expect(Object.keys(state.imports)).toEqual(["valid"]);
    expect(existsSync(`${path}.invalid`)).toBe(true);
  });

  it("preserves valid entries through validation round-trip", () => {
    const entry = makeEntry("abc123");
    saveImportsState(projectRoot, {
      version: IMPORTS_STATE_VERSION,
      applied: [],
      imports: { github: entry },
    });
    const reloaded = loadImportsState(projectRoot);
    expect(reloaded.imports.github?.specHash).toBe("abc123");
  });
});

describe("saving an import's record as an apply's commit", () => {
  it("records the apply's id with it, keeping the latest twenty", () => {
    for (let n = 1; n <= 22; n += 1) saveImportEntry(projectRoot, "github", makeEntry(`h${n}`), `apply-${n}`);

    const { applied, imports } = loadImportsState(projectRoot);

    expect(imports.github?.specHash).toBe("h22");
    expect(applied).toHaveLength(20);
    expect(applied[0]).toBe("apply-3");
    expect(applied.at(-1)).toBe("apply-22");
  });

  it("keeps an older id while its apply's journal is still on disk, so a restart never undoes that apply", () => {
    const journal = { importName: "github", state: "committing" as const, entries: [], createdDirs: [], temps: [] };
    saveJournal(projectRoot, { ...journal, id: "apply-1", backupDir: ".courier/backups/apply-1" });

    for (let n = 1; n <= 22; n += 1) saveImportEntry(projectRoot, "github", makeEntry(`h${n}`), `apply-${n}`);

    const { applied } = loadImportsState(projectRoot);
    expect(applied).toContain("apply-1");
    expect(applied).not.toContain("apply-2");
    expect(applied).toHaveLength(21);
  });

  it.skipIf(IS_WINDOWS || IS_ROOT)("refuses to save over a state it cannot read, which keeps every other import's record", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    saveImportsState(projectRoot, { version: IMPORTS_STATE_VERSION, imports: { other: makeEntry("o") }, applied: [] });
    const path = resolveImportsStatePath(projectRoot);
    const before = readFileSync(path, "utf8");
    chmodSync(path, 0o000);
    try {
      expect(() => saveImportEntry(projectRoot, "github", makeEntry("g"), "apply-1")).toThrow(
        expect.objectContaining({ code: "IMPORTS_STATE_UNSAFE" }),
      );
    } finally {
      chmodSync(path, 0o644);
    }

    expect(readFileSync(path, "utf8")).toBe(before);
  });
});

describe("computeSpecHash re-export", () => {
  it("hashes ParsedSpec-shaped input deterministically", () => {
    const spec = {
      title: "test",
      version: "1",
      groups: [],
      schemas: [],
      securitySchemes: [],
    };
    const a = computeSpecHash(spec as never);
    const b = computeSpecHash(spec as never);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });
});

describe("imports named after Object.prototype members", () => {
  it("keeps an import named __proto__ as an entry through a save and a load", () => {
    const state = recordImport(
      { version: IMPORTS_STATE_VERSION, imports: {}, applied: [] },
      "__proto__",
      makeEntry("h1"),
    );

    saveImportsState(projectRoot, state);
    const loaded = loadImportsState(projectRoot);

    expect(Object.keys(loaded.imports)).toEqual(["__proto__"]);
    expect(Object.getPrototypeOf(loaded.imports)).toBe(Object.prototype);
  });

  it("finds no recorded import for a name only Object.prototype has", () => {
    const state: ImportsState = {
      version: IMPORTS_STATE_VERSION,
      applied: [],
      imports: { api: makeEntry("h1") },
    };

    expect(removeImport(state, "constructor")).toBe(state);
    expect(hasSpecChanged(state, "toString", "h1")).toBe(true);
  });
});

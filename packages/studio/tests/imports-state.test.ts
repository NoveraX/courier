import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
  recordImport,
  removeImport,
  resolveImportsStatePath,
  saveImportsState,
} from "../src/apis/imports-state";

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), "courier-imports-state-"));
});

afterEach(() => {
  if (projectRoot && existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true });
});

function makeEntry(specHash: string): ImportStateEntry {
  return {
    specHash,
    fetchedAt: "2026-04-08T12:00:00.000Z",
    lastSyncedAt: "2026-04-08T12:00:01.000Z",
    userModified: [],
    generatedFiles: [],
    fileFingerprints: {},
  };
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
      imports: { github: makeEntry("abc123") },
    };
    saveImportsState(projectRoot, initial);
    const reloaded = loadImportsState(projectRoot);
    expect(reloaded).toEqual(initial);
  });

  it("does not leave .tmp.* files behind on success", () => {
    saveImportsState(projectRoot, { version: IMPORTS_STATE_VERSION, imports: {} });
    const dir = join(projectRoot, ".courier");
    const files = readdirSync(dir);
    expect(files.some((f) => f.includes(".tmp."))).toBe(false);
  });
});

describe("recordImport / removeImport", () => {
  it("recordImport inserts a new entry", () => {
    const state = recordImport(
      { version: IMPORTS_STATE_VERSION, imports: {} },
      "github",
      makeEntry("abc"),
    );
    expect(state.imports.github?.specHash).toBe("abc");
  });

  it("recordImport replaces an existing entry", () => {
    const initial = recordImport(
      { version: IMPORTS_STATE_VERSION, imports: {} },
      "github",
      makeEntry("abc"),
    );
    const next = recordImport(initial, "github", makeEntry("def"));
    expect(next.imports.github?.specHash).toBe("def");
  });

  it("removeImport drops the entry", () => {
    const initial = recordImport(
      { version: IMPORTS_STATE_VERSION, imports: {} },
      "github",
      makeEntry("abc"),
    );
    const next = removeImport(initial, "github");
    expect(next.imports).toEqual({});
  });

  it("removeImport is a no-op when entry is missing", () => {
    const state: ImportsState = { version: IMPORTS_STATE_VERSION, imports: {} };
    expect(removeImport(state, "missing")).toBe(state);
  });
});

describe("hasSpecChanged", () => {
  const state = recordImport(
    { version: IMPORTS_STATE_VERSION, imports: {} },
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
    const state = recordImport({ version: IMPORTS_STATE_VERSION, imports: {} }, "github", entry);
    expect(state.imports.github?.digest).toEqual(digest);
  });

  it("loadImportsState after saveImportsState preserves digest", () => {
    const entry: ImportStateEntry = { ...makeEntry("abc"), digest };
    saveImportsState(projectRoot, {
      version: IMPORTS_STATE_VERSION,
      imports: { github: entry },
    });
    const reloaded = loadImportsState(projectRoot);
    expect(reloaded.imports.github?.digest).toEqual(digest);
  });

  it("removeImport does not touch other entries' digest", () => {
    const withTwo: ImportsState = {
      version: IMPORTS_STATE_VERSION,
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

  it("says the state was corrupt even when its backup cannot be written", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const path = resolveImportsStatePath(projectRoot);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "{broken json!!!");
    mkdirSync(`${path}.corrupt`);

    const state = loadImportsState(projectRoot);

    const lines = warn.mock.calls.map((call) => String(call[1]));
    expect(state.imports).toEqual({});
    expect(lines.some((line) => line.includes("Corrupt imports-state JSON"))).toBe(true);
    expect(lines.some((line) => line.includes("Could not save the corrupt imports-state"))).toBe(true);
    warn.mockRestore();
  });

  it("drops entries with missing required fields", () => {
    const path = resolveImportsStatePath(projectRoot);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        imports: {
          valid: {
            specHash: "abc",
            fetchedAt: "2026-01-01T00:00:00Z",
            lastSyncedAt: "2026-01-01T00:00:01Z",
            userModified: [],
            generatedFiles: [],
            fileFingerprints: {},
          },
          invalid: {
            specHash: 123,
          },
        },
      }),
    );
    const state = loadImportsState(projectRoot);
    expect(state.imports.valid).toBeDefined();
    expect(state.imports.invalid).toBeUndefined();
  });

  it("preserves valid entries through validation round-trip", () => {
    const entry = makeEntry("abc123");
    saveImportsState(projectRoot, {
      version: IMPORTS_STATE_VERSION,
      imports: { github: entry },
    });
    const reloaded = loadImportsState(projectRoot);
    expect(reloaded.imports.github?.specHash).toBe("abc123");
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

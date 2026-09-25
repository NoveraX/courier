import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readPathAliases } from "@noverax/courier-studio-core/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { absentImportCandidates } from "../src/server/absent-import-candidates";

const EXTENSIONS = ["", ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "courier-absent-candidates-")));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("absentImportCandidates", () => {
  it("names the path a relative import spells with each extension the resolution tries", () => {
    mkdirSync(join(dir, "src"));

    const candidates = absentImportCandidates(dir, "./src/late", readPathAliases(dir));

    expect(candidates).toEqual(EXTENSIONS.map((extension) => join(dir, "src", `late${extension}`)));
  });

  it("names the first missing directory of an import into a directory that does not exist", () => {
    const candidates = absentImportCandidates(dir, "./generated/client/api", readPathAliases(dir));

    expect(candidates).toEqual([join(dir, "generated")]);
    for (const path of candidates) expect(existsSync(dirname(path))).toBe(true);
  });

  it("names the index files of an existing directory that holds none", () => {
    mkdirSync(join(dir, "api"));

    const candidates = absentImportCandidates(dir, "./api", readPathAliases(dir));

    expect(candidates).toEqual([
      ...EXTENSIONS.slice(1).map((extension) => join(dir, `api${extension}`)),
      ...EXTENSIONS.map((extension) => join(dir, "api", `index${extension}`)),
    ]);
  });

  it("names the paths an aliased import could be created at", () => {
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }));
    mkdirSync(join(dir, "src"));

    const candidates = absentImportCandidates(dir, "@/late", readPathAliases(dir));

    expect(candidates).toEqual(EXTENSIONS.map((extension) => join(dir, "src", `late${extension}`)));
  });

  it("names nothing for a package or a node builtin", () => {
    expect(absentImportCandidates(dir, "@noverax/courier/config", readPathAliases(dir))).toEqual([]);
    expect(absentImportCandidates(dir, "node:fs", readPathAliases(dir))).toEqual([]);
  });

  it("leaves out a candidate that exists but is no file the resolution takes", () => {
    mkdirSync(join(dir, "src", "late.ts"), { recursive: true });

    const candidates = absentImportCandidates(dir, "./src/late", readPathAliases(dir));

    expect(candidates).not.toContain(join(dir, "src", "late.ts"));
    expect(candidates).toContain(join(dir, "src", "late.tsx"));
  });
});

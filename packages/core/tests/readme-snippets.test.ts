/**
 * The README's snippets, compiled as a project that copies them would compile
 * them: the API from the Quick Start, then the Testing and the Building Server
 * Adapters snippets beside it, against the published types.
 *
 * The Testing snippet mocked `users.getAll` — which answers `User[]` — with
 * strings such as `"once"`, so a test copied from it failed to compile.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

const README = readFileSync(fileURLToPath(new URL("../README.md", import.meta.url)), "utf-8");

/* Inside the repository's node_modules, so the packages resolve the way they
   do from a user's project. */
const ROOT = fileURLToPath(
  new URL("../../../node_modules/.cache/courier-core-readme/", import.meta.url),
);

const OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  skipLibCheck: true,
  types: ["vitest/globals"],
};

/** The first TypeScript block under a README heading. */
function snippetUnder(heading: string): string {
  const section = README.indexOf(`\n${heading}\n`);
  if (section === -1) throw new Error(`The README has no "${heading}" heading`);
  const match = /```ts\n([\s\S]*?)```/.exec(README.slice(section));
  if (!match?.[1]) throw new Error(`The README has no TypeScript block under "${heading}"`);
  return match[1];
}

function write(path: string, content: string): string {
  const file = join(ROOT, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

function diagnostics(file: string): string[] {
  const program = ts.createProgram([file], OPTIONS);
  return ts.getPreEmitDiagnostics(program).map((d) => {
    const where = `${basename(d.file?.fileName ?? "")}:${d.start ?? ""}`;
    return `${where}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`;
  });
}

/* The module both snippets import: the Quick Start's API, and the sources map
   a server registers. */
write(
  "api/sources.ts",
  `${snippetUnder("### 1. Define your API")}\nexport const sources = { api }\n`,
);

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

describe("the core README", () => {
  it("has a Testing snippet that compiles", () => {
    const file = write("testing.test.ts", `${snippetUnder("## Testing")}\nexport {}\n`);

    expect(diagnostics(file)).toEqual([]);
  });

  it("has a Building Server Adapters snippet that compiles", () => {
    const snippet = snippetUnder("## Building Server Adapters");
    const file = write("adapter.ts", `${snippet}\nexport {}\n`);

    expect(diagnostics(file)).toEqual([]);
  });
});

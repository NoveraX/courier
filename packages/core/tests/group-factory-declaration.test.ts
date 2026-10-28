/**
 * @vitest-environment node
 *
 * A library's factory of groups, generic over the endpoints its caller hands
 * it, as its declaration file declares it: the group it returns keeps its
 * type there. A name kept from endpoints was typed `never`, and the
 * declaration emitter reduced the group built over it to `never` too, so a
 * project installing the library got `never` from every call.
 */
import { join, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SOURCES = resolve(import.meta.dirname, "../src");
const STANDARD_LIBRARY = resolve(import.meta.dirname, "../../../types/standard-library.d.ts");
const FACTORY = join(import.meta.dirname, "group-factory.fixture.ts");

const FACTORY_SOURCE = `import { defineGroup, type OwnEndpoints } from "@noverax/courier/define";

export function openGroup<E extends OwnEndpoints>(endpoints: E) {
  return defineGroup({ expose: true, endpoints });
}

export function plainGroup<E extends OwnEndpoints>(endpoints: E) {
  return defineGroup({ endpoints });
}
`;

/* The declaration file TypeScript writes for the factory, with the package read from its sources. */
function declarationOfFactory(): { declared: string; problems: string[] } {
  const options: ts.CompilerOptions = {
    strict: true,
    exactOptionalPropertyTypes: true,
    declaration: true,
    emitDeclarationOnly: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ESNext,
    skipLibCheck: true,
    types: [],
    rootDir: "/",
    outDir: "/declarations",
    paths: { "@noverax/courier/define": [join(SOURCES, "define/index.ts")] },
  };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  host.readFile = (file) => (file === FACTORY ? FACTORY_SOURCE : readFile(file));
  const exists = host.fileExists.bind(host);
  host.fileExists = (file) => file === FACTORY || exists(file);
  let declared = "";
  host.writeFile = (file, text) => {
    if (file.endsWith("group-factory.fixture.d.ts")) declared = text;
  };
  const program = ts.createProgram([STANDARD_LIBRARY, FACTORY], options, host);
  const emitted = program.emit(program.getSourceFile(FACTORY));
  const problems = [
    ...ts.getPreEmitDiagnostics(program, program.getSourceFile(FACTORY)),
    ...emitted.diagnostics,
  ].map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
  return { declared, problems };
}

describe("a generic factory of groups, as a declaration file declares it", () => {
  it("returns the group built over the endpoints it is handed, never `never`", () => {
    const { declared, problems } = declarationOfFactory();

    expect(problems).toEqual([]);
    expect(declared).toContain("DefinedGroup<E, true>");
    expect(declared).toContain("DefinedGroup<E, undefined>");
    expect(declared).not.toMatch(/\): never;/);
  }, 60_000);
});

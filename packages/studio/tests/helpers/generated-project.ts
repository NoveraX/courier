/**
 * Generated code, compiled and run the way a project uses it.
 *
 * Files are written inside the repository's `node_modules`, so the libraries
 * they import resolve as they do from a user's project; they are compiled
 * with TypeScript; and they are loaded with the real courier runtime and the
 * real validation libraries, so a call reaches a real server.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import * as courier from "@noverax/courier";
import * as courierDefine from "@noverax/courier/define";
import * as courierMiddleware from "@noverax/courier/middleware";
import * as arktype from "arktype";
import ts from "typescript";
import * as valibot from "valibot";
import * as zod from "zod";

import type { GeneratedFile } from "../../src/apis/generator";

const ROOT = fileURLToPath(
  new URL("../../../../node_modules/.cache/courier-generated-projects/", import.meta.url),
);

/** The packages generated code imports, as the running process has them. */
const PACKAGES: ReadonlyMap<string, unknown> = new Map<string, unknown>([
  ["@noverax/courier", courier],
  ["@noverax/courier/define", courierDefine],
  ["@noverax/courier/middleware", courierMiddleware],
  ["zod", zod],
  ["valibot", valibot],
  ["arktype", arktype],
]);

/** What every project is compiled with: strict, resolved as a bundler does. */
export const STRICT: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  skipLibCheck: true,
  types: [],
};

/**
 * Write generated files, and any others the test adds, into a directory of
 * their own.
 *
 * @param label - Names the directory; distinct per project
 * @param files - The generated files, by project-relative path
 * @param extra - More files by the same kind of path, a consumer for one
 * @returns The directory the paths are relative to
 */
export function writeProject(
  label: string,
  files: readonly GeneratedFile[],
  extra: Record<string, string> = {},
): string {
  const dir = join(ROOT, label);
  rmSync(dir, { recursive: true, force: true });
  const all = [...files, ...Object.entries(extra).map(([path, content]) => ({ path, content }))];
  for (const file of all) {
    mkdirSync(dirname(join(dir, file.path)), { recursive: true });
    writeFileSync(join(dir, file.path), file.content);
  }
  return dir;
}

/**
 * Compile a project and report what TypeScript finds wrong.
 *
 * @param dir - The project's directory
 * @param roots - Files to compile, relative to it; their imports follow
 * @param options - Compiler options; {@link STRICT} when omitted
 * @returns One line per diagnostic, `file(line): message`
 */
export function compileProject(
  dir: string,
  roots: readonly string[],
  options: ts.CompilerOptions = STRICT,
): string[] {
  const program = ts.createProgram(
    roots.map((root) => join(dir, root)),
    options,
  );
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    if (!diagnostic.file || diagnostic.start === undefined) return text;
    const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    return `${diagnostic.file.fileName.slice(dir.length + 1)}(${line + 1}): ${text}`;
  });
}

/** Remove every project the suite wrote. */
export function removeProjects(): void {
  rmSync(ROOT, { recursive: true, force: true });
}

/**
 * Load a generated module and everything it imports, with the real packages.
 *
 * @param files - The generated files
 * @param entry - The path of the module to load, as a file lists it
 * @returns Its exports
 */
export function loadGenerated(
  files: readonly GeneratedFile[],
  entry: string,
): Record<string, unknown> {
  const sources = new Map(files.map((file) => [withoutExtension(file.path), file.content]));
  const loaded = new Map<string, Record<string, unknown>>();

  const load = (path: string): Record<string, unknown> => {
    const key = sources.has(path) ? path : `${path}/index`;
    const known = loaded.get(key);
    if (known) return known;
    const source = sources.get(key);
    if (source === undefined) throw new Error(`nothing was generated at ${path}`);

    const exports: Record<string, unknown> = {};
    loaded.set(key, exports);
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const require = (id: string): unknown => {
      if (id.startsWith(".")) return load(posix.join(posix.dirname(key), withoutExtension(id)));
      if (!PACKAGES.has(id)) throw new Error(`generated code imports ${id}, which is not loaded`);
      return PACKAGES.get(id);
    };
    new Function("require", "exports", outputText)(require, exports);
    return exports;
  };

  return load(withoutExtension(entry));
}

function withoutExtension(path: string): string {
  return path.replace(/\.(ts|js)$/, "");
}

/**
 * Compile the files the generator writes, as a strict project would.
 *
 * The files go inside the repository's `node_modules`, so `@noverax/courier`
 * and the validation libraries resolve the way they do from a user's project.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import type { GeneratedFile } from "../../src/apis/generator";

const CACHE = fileURLToPath(new URL("../../../../node_modules/.cache/", import.meta.url));

const STRICT: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  skipLibCheck: true,
  types: [],
};

export interface GeneratedProject {
  /**
   * Write the files, with a `check.ts` beside them when given, and compile.
   *
   * @param label - Directory of this compilation, unique within the project
   * @param files - What `generateCode` returned
   * @param check - Source of a file that uses the generated code
   * @returns Every diagnostic, as `file: message`
   */
  diagnostics(label: string, files: GeneratedFile[], check?: string): string[];
  /** Remove every file written. */
  remove(): void;
}

/**
 * A place to compile generated code in.
 *
 * @param name - Directory under `node_modules/.cache`, unique to the suite
 * @returns The project
 * @example
 * ```ts
 * const project = generatedProject("courier-nullable-schemas");
 * expect(project.diagnostics("zod", files, 'import type { A } from "./src/api/index";')).toEqual([]);
 * project.remove();
 * ```
 */
export function generatedProject(name: string): GeneratedProject {
  const root = join(CACHE, name);
  return {
    diagnostics(label, files, check) {
      const dir = join(root, label);
      const paths = files.map((file) => write(join(dir, file.path), file.content));
      if (check !== undefined) paths.push(write(join(dir, "check.ts"), check));
      const program = ts.createProgram(paths, STRICT);
      return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
        return `${diagnostic.file?.fileName.slice(dir.length + 1) ?? ""}: ${message}`;
      });
    },
    remove() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function write(path: string, content: string): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

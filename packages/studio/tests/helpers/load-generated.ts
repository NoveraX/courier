/**
 * Run the files the generator writes, against the real libraries.
 *
 * Each file is transpiled to CommonJS and evaluated with a `require` that
 * finds the generated files among themselves and hands every package they
 * import over as the test itself loaded it — so a generated client calls
 * through the real `@noverax/courier` and validates with the real zod,
 * valibot or ArkType.
 */
import { posix } from "node:path";
import * as courier from "@noverax/courier";
import * as courierDefine from "@noverax/courier/define";
import * as arktype from "arktype";
import ts from "typescript";
import * as valibot from "valibot";
import * as zod from "zod";

import type { GeneratedFile } from "../../src/apis/generator";

const PACKAGES: ReadonlyMap<string, unknown> = new Map<string, unknown>([
  ["@noverax/courier", courier],
  ["@noverax/courier/define", courierDefine],
  ["arktype", arktype],
  ["valibot", valibot],
  ["zod", zod],
]);

type ModuleExports = Record<string, unknown>;

/**
 * Evaluate one generated file, and every generated file it imports.
 *
 * @param files - What `generateCode` returned
 * @param entry - Path of the file to evaluate, as `files` names it
 * @returns The file's exports
 * @example
 * ```ts
 * const index = loadGenerated(generateCode(spec, options, "edge"), "src/api/edge/index.ts");
 * await (index.edgeApi as EdgeApi).files.getFile({ id: "f1" });
 * ```
 */
export function loadGenerated(files: GeneratedFile[], entry: string): ModuleExports {
  const sources = new Map(files.map((file) => [file.path, file.content]));
  const loaded = new Map<string, ModuleExports>();

  function load(path: string): ModuleExports {
    const cached = loaded.get(path);
    if (cached) return cached;
    const source = sources.get(path);
    if (source === undefined) throw new Error(`nothing was generated at ${path}`);

    const exports: ModuleExports = {};
    loaded.set(path, exports);
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const require = (specifier: string): unknown =>
      specifier.startsWith(".") ? load(resolve(path, specifier)) : packageNamed(specifier);
    new Function("require", "exports", "module", outputText)(require, exports, { exports });
    return exports;
  }

  function resolve(from: string, specifier: string): string {
    const base = posix.join(posix.dirname(from), specifier);
    const candidate = [`${base}.ts`, `${base}/index.ts`].find((path) => sources.has(path));
    if (!candidate) throw new Error(`${from} imports ${specifier}, which was not generated`);
    return candidate;
  }

  return load(entry);
}

/** An endpoint of a generated caller, reached by name. */
export type GeneratedCall = (variables?: unknown) => Promise<unknown>;

/**
 * Reach an endpoint through the exports of a generated file.
 *
 * @param exports - What `loadGenerated` returned
 * @param path - Names from the export to the endpoint: the caller, a group, the endpoint
 * @returns A function making the call
 * @example
 * ```ts
 * await generatedCall(index, ["edgeApi", "files", "deleteFile"])({ file_id: "f1" });
 * ```
 */
export function generatedCall(exports: ModuleExports, path: readonly string[]): GeneratedCall {
  let target: unknown = exports;
  for (const key of path) {
    if ((typeof target !== "object" && typeof target !== "function") || target === null) {
      throw new Error(`${path.join(".")} does not exist: nothing holds ${key}`);
    }
    target = Reflect.get(target, key);
  }
  if (typeof target !== "function") throw new Error(`${path.join(".")} is not callable`);
  const endpoint = target;
  return async (variables) => {
    const result: unknown = await Reflect.apply(endpoint, undefined, [variables]);
    return result;
  };
}

function packageNamed(specifier: string): unknown {
  const found = PACKAGES.get(specifier);
  if (found === undefined) throw new Error(`generated code imports ${specifier}, which is not loaded`);
  return found;
}

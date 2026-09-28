import { dirname, join, relative, sep } from "node:path";

import type {
  CourierImportBase,
  CourierImportEntry,
  CourierImportSpecType,
} from "@noverax/courier/config";

import type { GenerateOptions, ParsedSpec } from "../apis";
import { DEFAULT_OPTIONS } from "../apis/generator/types";
import { resolveImportLayout } from "../apis/layout";
import type { LoadedCourierConfig } from "./config-loader";
import { formatImportSnippet } from "./format-import-snippet";
import { writesExplicitExtensions } from "./mocks-edit/writes-explicit-extensions";
import { NameTakenError } from "./name-taken-error";
import type { ImportDeclaration, WriteBody } from "./write-types";

const SPEC_TYPES: ReadonlyMap<string, CourierImportSpecType> = new Map([
  ["openapi3", "openapi"],
  ["swagger2", "swagger"],
  ["postman", "postman"],
]);

/** What {@link describeImportDeclaration} reads. */
export interface DeclarationInput {
  /** The import's name, as the write was asked for it. */
  name: string;
  /** The write: the spec the files are generated from, and the options. */
  body: WriteBody;
  /** The config Studio runs, which the write acted on. */
  loaded: LoadedCourierConfig;
  /** The project root, symlinks resolved. */
  root: string;
}

/**
 * Describe what the config must still declare for an import Studio just
 * wrote, from the options the files were generated with: the import of the
 * generated source and its `sources` entry while `sources` does not declare
 * it, and the `imports` entry while `imports` does not name the import. The
 * source is named as the code generator emits it and imported from where it
 * wrote it, relative to the config; the `imports` entry carries every choice
 * that differs from the generator's defaults, and the source name always.
 *
 * `sources` declares the generated source only when it names the import and
 * the config imports the file Studio generated, directly or through another
 * module. A source of that name from anywhere else is another API: Studio
 * matches an import to the source of its name, so the import is refused
 * before anything is written.
 *
 * The endpoints the write left out are counted, because the `imports` entry
 * cannot keep a selection: regenerating from it, as an update does,
 * generates every endpoint in the specification.
 *
 * @param input - The import's name, the write, the config and the project root
 * @returns What is left to declare; none once the config declares both
 * @throws {NameTakenError} When `sources` declares another API under the import's name
 *
 * @example
 * ```ts
 * describeImportDeclaration({ name: "pets", body, loaded, root });
 * // → { configFile: "courier.config.ts",
 * //     source: { importLine: 'import { pets } from "./src/api/pets/source";', entry: "pets," },
 * //     importEntry: '  "pets": {\n    importType: "url",\n …',
 * //     leftOut: 3 }
 * ```
 */
export function describeImportDeclaration({
  name,
  body,
  loaded,
  root,
}: DeclarationInput): ImportDeclaration | undefined {
  const { spec, options } = body;
  const layout = resolveImportLayout(
    { outputDir: options.outputDir, sourceName: options.sourceName },
    name,
  );
  const binding = layout.sourceBinding;
  const sourceFile = layout.sourceFile;
  const configFile = posixPath(relative(root, loaded.configFile));
  const declared = sourceDeclared(name, join(root, sourceFile), loaded);
  if (declared === "another") throw new NameTakenError(name, sourceFile);
  /* The config imports the source as it imports its other files. */
  const configName = relative(root, loaded.configFile);
  const extension = writesExplicitExtensions(root, configName, configName) ? ".js" : "";
  const source =
    declared === "no"
      ? sourceParts(
          name,
          binding,
          join(root, sourceFile.replace(/\.ts$/, extension)),
          loaded.configFile,
        )
      : undefined;
  const importEntry = Object.hasOwn(loaded.config.imports ?? {}, name)
    ? undefined
    : formatImportSnippet(name, entryOf(body, spec, { ...options, sourceName: binding }));
  if (!source && !importEntry) return undefined;
  const leftOut = importEntry ? countLeftOut(spec, options.selectedEndpoints) : 0;
  return { configFile, source, importEntry, ...(leftOut > 0 && { leftOut }) };
}

/* Whether `sources` names the import, and whether what it names is the
   generated source: the load read that file, which the config imports
   directly or through another module. */
function sourceDeclared(
  name: string,
  sourcePath: string,
  loaded: LoadedCourierConfig,
): "no" | "yes" | "another" {
  if (!Object.hasOwn(loaded.config.sources ?? {}, name)) return "no";
  return (loaded.depHashes.get(sourcePath) ?? null) === null ? "another" : "yes";
}

function countLeftOut(spec: ParsedSpec, selected: GenerateOptions["selectedEndpoints"]): number {
  if (!selected) return 0;
  let leftOut = 0;
  for (const group of spec.groups) {
    const chosen = Object.hasOwn(selected, group.name) ? selected[group.name] : undefined;
    const kept = new Set(Array.isArray(chosen) ? chosen : []);
    leftOut += group.endpoints.filter((endpoint) => !kept.has(endpoint.name)).length;
  }
  return leftOut;
}

function sourceParts(
  name: string,
  binding: string,
  sourcePath: string,
  configFile: string,
): { importLine: string; entry: string } {
  const specifier = posixPath(relative(dirname(configFile), sourcePath));
  const from = specifier.startsWith("../") ? specifier : `./${specifier}`;
  return {
    importLine: `import { ${binding} } from ${JSON.stringify(from)};`,
    entry: binding === name ? `${binding},` : `${JSON.stringify(name)}: ${binding},`,
  };
}

function entryOf(body: WriteBody, spec: ParsedSpec, options: GenerateOptions): CourierImportEntry {
  const base: CourierImportBase = {
    type: SPEC_TYPES.get(spec.format) ?? DEFAULT_OPTIONS.type,
    outputDir: options.outputDir,
    sourceName: options.sourceName,
    ...codegenChoices(options),
  };
  if (body.importType === "url") return { importType: "url", from: body.specUrl ?? "", ...base };
  return body.importType === "raw"
    ? { importType: "raw", ...base }
    : { importType: "file", ...base };
}

function codegenChoices(options: GenerateOptions): Partial<CourierImportBase> {
  return {
    validation: differs(options.validation, DEFAULT_OPTIONS.validation),
    groupBy: differs(options.groupBy, DEFAULT_OPTIONS.groupBy),
    generateTypes: differs(options.generateTypes, DEFAULT_OPTIONS.generateTypes),
    generateSchemas: differs(options.generateSchemas, DEFAULT_OPTIONS.generateSchemas),
    generateClient: differs(options.generateClient, DEFAULT_OPTIONS.generateClient),
    addAuthMiddleware: differs(options.addAuthMiddleware, DEFAULT_OPTIONS.addAuthMiddleware),
    includeComments: differs(options.includeComments, DEFAULT_OPTIONS.includeComments),
  };
}

function differs<TValue>(value: TValue | undefined, preset: TValue): TValue | undefined {
  return value === preset ? undefined : value;
}

function posixPath(path: string): string {
  return path.split(sep).join("/");
}

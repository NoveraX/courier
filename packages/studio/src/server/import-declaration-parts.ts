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
import { writesExplicitExtensions } from "./mocks-edit/writes-explicit-extensions";
import { NameTakenError } from "./name-taken-error";
import type { WriteBody } from "./write-types";

const SPEC_TYPES: ReadonlyMap<string, CourierImportSpecType> = new Map([
  ["openapi3", "openapi"],
  ["swagger2", "swagger"],
  ["postman", "postman"],
]);

/** What {@link importDeclarationParts} reads. */
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

/** What the config must still declare for an import, as data. */
export interface ImportDeclarationParts {
  /** The config, relative to the project root. */
  configFile: string;
  /** The config's absolute path. */
  configPath: string;
  /** The generated source's export, and where the config imports it from; absent once `sources` declares it. */
  source?: { binding: string; specifier: string } | undefined;
  /** The `imports` entry; absent once `imports` names the import. */
  importEntry?: CourierImportEntry | undefined;
  /** How many of the specification's endpoints the write left out; counted only with `importEntry`. */
  leftOut: number;
}

/**
 * What the config must still declare for an import Studio wrote, from the
 * options the files were generated with: the generated source, imported from
 * where it was written relative to the config, while `sources` does not
 * declare it; and the `imports` entry, carrying every choice that differs
 * from the generator's defaults and the source name always, while `imports`
 * does not name the import.
 *
 * `sources` declares the generated source only when it names the import and
 * the config imports the file Studio generated, directly or through another
 * module. A source of that name from anywhere else is another API: Studio
 * matches an import to the source of its name, so the import is refused.
 *
 * @param input - The import's name, the write, the config and the project root
 * @returns What is left to declare; none once the config declares both
 * @throws {NameTakenError} When `sources` declares another API under the import's name
 * @example
 * ```ts
 * importDeclarationParts({ name: "pets", body, loaded, root });
 * // → { configFile: "courier.config.ts", configPath: "/app/courier.config.ts",
 * //     source: { binding: "pets", specifier: "./src/api/pets/source" },
 * //     importEntry: { importType: "url", type: "openapi", … }, leftOut: 0 }
 * ```
 */
export function importDeclarationParts({
  name,
  body,
  loaded,
  root,
}: DeclarationInput): ImportDeclarationParts | undefined {
  const { spec, options } = body;
  const layout = resolveImportLayout(
    { outputDir: options.outputDir, sourceName: options.sourceName },
    name,
  );
  const binding = layout.sourceBinding;
  const declared = sourceDeclared(name, join(root, layout.sourceFile), loaded);
  if (declared === "another") throw new NameTakenError(name, layout.sourceFile);
  /* The config imports the source as it imports its other files. */
  const configName = relative(root, loaded.configFile);
  const extension = writesExplicitExtensions(root, configName, configName) ? ".js" : "";
  const sourcePath = join(root, layout.sourceFile.replace(/\.ts$/, extension));
  const source =
    declared === "no"
      ? { binding, specifier: specifierOf(sourcePath, loaded.configFile) }
      : undefined;
  const importEntry = Object.hasOwn(loaded.config.imports ?? {}, name)
    ? undefined
    : entryOf(body, spec, { ...options, sourceName: binding });
  if (!source && !importEntry) return undefined;
  const leftOut = importEntry ? countLeftOut(spec, options.selectedEndpoints) : 0;
  const configFile = posixPath(configName);
  return { configFile, configPath: loaded.configFile, source, importEntry, leftOut };
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

function specifierOf(sourcePath: string, configFile: string): string {
  const specifier = posixPath(relative(dirname(configFile), sourcePath));
  return specifier.startsWith("../") ? specifier : `./${specifier}`;
}

/**
 * The type an import of a parsed specification is declared with.
 *
 * @param spec - The specification as Studio parsed it
 * @returns `openapi`, `swagger` or `postman`
 * @example
 * ```ts
 * specTypeOf(parseSpec(swagger2Text)); // "swagger"
 * ```
 */
export function specTypeOf(spec: ParsedSpec): CourierImportSpecType {
  return SPEC_TYPES.get(spec.format) ?? DEFAULT_OPTIONS.type;
}

function entryOf(body: WriteBody, spec: ParsedSpec, options: GenerateOptions): CourierImportEntry {
  const base: CourierImportBase = {
    type: specTypeOf(spec),
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
    include: options.include,
    exclude: options.exclude,
  };
}

function differs<TValue>(value: TValue | undefined, preset: TValue): TValue | undefined {
  return value === preset ? undefined : value;
}

function posixPath(path: string): string {
  return path.split(sep).join("/");
}

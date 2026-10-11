import { dirname, join, relative, sep } from "node:path";

import type { CourierImportEntry } from "@noverax/courier/config";

import type { GenerateOptions, ParsedSpec } from "../apis";
import { resolveImportLayout } from "../apis/layout";
import { configObjectFile } from "./config-edit/config-object-file";
import { type SourcesModule, sourcesModuleFor } from "./config-edit/sources-module";
import type { LoadedCourierConfig } from "./config-loader";
import { importEntryOf } from "./import-entry-of";
import { writesExplicitExtensions } from "./mocks-edit/writes-explicit-extensions";
import { NameTakenError } from "./name-taken-error";
import type { WriteBody } from "./write-types";

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
  /** The generated source's export, and where the list imports it from; absent once `sources` declares it. */
  source?: { binding: string; specifier: string } | undefined;
  /** The module the config takes its `sources` from, where the source is listed, when the config does not write the list itself. */
  sourcesModule?: SourcesModule | undefined;
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
  /* The source is imported as the file that lists it imports its other files: the file that holds
     the config's lists, or the module the config takes its `sources` from. */
  const configPath = configObjectFile(loaded.configFile, root);
  const configName = relative(root, configPath);
  const sourcesModule = declared === "no" ? sourcesModuleFor(configPath, root) : undefined;
  const listPath = sourcesModule?.path ?? configPath;
  const listName = relative(root, listPath);
  const extension = writesExplicitExtensions(root, listName, listName) ? ".js" : "";
  const sourcePath = join(root, layout.sourceFile.replace(/\.ts$/, extension));
  const source =
    declared === "no" ? { binding, specifier: specifierOf(sourcePath, listPath) } : undefined;
  const importEntry = Object.hasOwn(loaded.config.imports ?? {}, name)
    ? undefined
    : importEntryOf(body, spec, { ...options, sourceName: binding });
  if (!source && !importEntry) return undefined;
  const leftOut = importEntry ? countLeftOut(spec, options.selectedEndpoints) : 0;
  const configFile = posixPath(configName);
  return { configFile, configPath, source, importEntry, leftOut, sourcesModule };
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

function posixPath(path: string): string {
  return path.split(sep).join("/");
}

/**
 * Main code generation orchestrator.
 */

import { InvalidImportError, resolveImportLayout } from "../layout";
import { isTopLevel, TOP_LEVEL } from "../parser/top-level";
import type { ParsedSchema, ParsedSpec } from "../parser/types";
import { emitsSchemas } from "./build-endpoint-helpers";
import { type ExtractedTypeNames, extractedTypeNames } from "./extracted-type-names";
import { generateGroupFile } from "./generate-group";
import { generateIndexFile } from "./generate-index";
import { generateProxyFile } from "./generate-proxy";
import { generateSchemasFile, generateTypesFile } from "./generate-schemas";
import { generateSourceFile } from "./generate-source";
import { schemaHomes } from "./schema-homes";
import { withSharedImports } from "./shared-schema-imports";
import { selectedEndpoints, transformSpec } from "./transform-spec";
import type { GeneratedFile, GenerateOptions, ResolvedGenerateOptions } from "./types";
import { applyImportDefaults } from "./types";
import { type WrittenGroup, writtenGroup } from "./written-group";

/**
 * Generate an import's files from a parsed spec, at the paths its layout
 * gives them.
 *
 * @param spec - The parsed spec
 * @param options - The import's declaration and, transiently, the endpoints picked
 * @param importName - The import's key under `imports`; `options.sourceName` when omitted, as the import wizard names both alike
 * @returns The files, each with its project-relative path
 * @throws {InvalidImportError} When the output directory or a name is refused
 * @example
 * ```ts
 * const files = generateCode(spec, { type: "openapi", outputDir: "src/api" }, "petStore");
 * ```
 */
export function generateCode(
  spec: ParsedSpec,
  options: GenerateOptions,
  importName: string | undefined = options.sourceName,
): GeneratedFile[] {
  if (importName === undefined) {
    throw new InvalidImportError("importName", "", "the import has no name");
  }
  const opts = applyImportDefaults(options, resolveImportLayout(options, importName));

  /* A selection names endpoints by the specification's own groups. */
  const selected = selectedEndpoints(spec.groups, opts.selectedEndpoints);
  const transformed = transformSpec(spec, opts, selected);
  /* Named, and its schemas placed, over the whole import, whatever is selected. */
  const whole = selected === null ? transformed : transformSpec(spec, opts, null);
  const names = extractedTypeNames(whole.groups, Object.keys(spec.schemas));
  return generateFiles(transformed, opts, names, schemaHomes(whole));
}

function generateFiles(
  spec: ParsedSpec,
  opts: ResolvedGenerateOptions,
  names: ExtractedTypeNames,
  homes: ReadonlyMap<string, string>,
): GeneratedFile[] {
  const written = spec.groups.map((group) => writtenGroup(group, spec, names, homes));
  const own = written.find((entry) => isTopLevel(entry.group));
  const groups = written.filter((entry) => !isTopLevel(entry.group));
  /* The import's module: the schemas of its own endpoints, and those groups share. */
  const rootSchemas: Record<string, ParsedSchema> = Object.assign(
    {},
    own?.own,
    ...groups.map((entry) => entry.shared),
  );
  const root = schemaFileFor(rootSchemas, opts);
  const files: GeneratedFile[] = root ? [root] : [];
  const schemaModules = new Map<string, string>(root ? [[TOP_LEVEL, root.content]] : []);

  for (const entry of groups) files.push(...groupFiles(entry, spec, opts, root, schemaModules));
  /* A group inside another is listed in its parent's file, not the source's. */
  const listed = groups.map((entry) => entry.group).filter((group) => !group.parent);
  const ownEndpoints = {
    endpoints: own?.group.endpoints ?? [],
    declared: root ? rootSchemas : {},
    params: own?.params ?? {},
  };
  files.push(generateSourceFile(ownEndpoints, listed, spec, opts));
  files.push(generateIndexFile(spec, opts, schemaModules));
  const proxy = generateProxyFile(spec, opts);
  if (proxy) files.push(proxy);
  return files;
}

/* A group's schemas module, importing what it names of the import's, and its endpoints. */
function groupFiles(
  group: WrittenGroup,
  spec: ParsedSpec,
  opts: ResolvedGenerateOptions,
  root: GeneratedFile | null,
  schemaModules: Map<string, string>,
): GeneratedFile[] {
  const name = group.group.name;
  const ownFile = schemaFileFor(group.own, opts, name);
  const module =
    ownFile && root ? withSharedImports(ownFile, root.content, sharedFrom(opts)) : ownFile;
  if (module) schemaModules.set(name, module.content);
  const shared = root ? group.shared : {};
  const declared = { ...(module ? group.own : {}), ...shared };
  const endpoints = generateGroupFile(
    group.group,
    spec,
    opts,
    declared,
    group.params,
    new Set(Object.keys(shared)),
  );
  return module ? [module, endpoints] : [endpoints];
}

/* How a group's folder names the import's own schemas module. */
function sharedFrom(opts: ResolvedGenerateOptions): string {
  return `../${opts.generateSchemas ? "schemas" : "types"}${opts.importExtension}`;
}

/**
 * The schemas or types file declaring a group's schemas, when there is
 * anything to declare.
 *
 * Only a validator writing schemas, or types, declares anything: with
 * `validation: "none"` and types off, a schemas file held the schemas'
 * descriptions alone, which the barrel then re-exported as a module that
 * is not one, and TypeScript rejected it.
 */
function schemaFileFor(
  schemas: Record<string, ParsedSchema>,
  opts: ResolvedGenerateOptions,
  groupName?: string,
): GeneratedFile | null {
  if (Object.keys(schemas).length === 0 || !(emitsSchemas(opts) || opts.generateTypes)) {
    return null;
  }
  return opts.generateSchemas
    ? generateSchemasFile(schemas, opts, groupName)
    : generateTypesFile(schemas, opts, groupName);
}

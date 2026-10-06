import { posix } from "node:path";
import { toBindingName, toCamelCase } from "../parser/naming-utils";
import { canonicalOutputDir, STUDIO_OFF_LIMITS } from "./canonical-output-dir";
import { checkImportName, MAX_NAME_LENGTH } from "./check-import-name";
import { directoryName } from "./directory-name";
import { InvalidImportError, type InvalidImportField } from "./invalid-import-error";

/* A group is named by a binding, as `toBindingName` makes them. */
const GROUP_BINDING = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** The file a group's or a flat import's schemas go into. */
export type SchemaFileKind = "schemas" | "types";

/** The part of an import declaration that decides where its files go. */
export interface ImportPlacement {
  /** The directory the import's own directory goes into, relative to the project. */
  outputDir: string;
  /** The name the source is exported under; the import's key when absent. */
  sourceName?: string | undefined;
}

/**
 * Where every file of one import goes, relative to the project with `/`
 * separators. Generation, the disk scan, cleanup, manage, update and remove
 * all take their paths from here, so they never disagree about a directory.
 * A group is named by its binding; any other name is refused, so no group
 * resolves to the import's own directory or outside it.
 */
export interface ImportLayout {
  /** The import's key under `imports`. */
  readonly importName: string;
  /** The binding the generated source is exported under. */
  readonly sourceBinding: string;
  /** The declared output directory, in its canonical spelling. */
  readonly outputDir: string;
  /** The import's own directory. */
  readonly dir: string;
  /** `source.ts`, which defines the API. */
  readonly sourceFile: string;
  /** `index.ts`, the barrel: the direct caller, and the schemas and types. */
  readonly indexFile: string;
  /** `proxy.ts`, the proxy caller alone, which browser code imports. */
  readonly proxyFile: string;
  /** The schemas or types file of an import generated as one flat group. */
  schemaFile(kind: SchemaFileKind): string;
  /** The directory of a group, by the group's binding. */
  groupDir(group: string): string;
  /** A group's endpoint file. */
  groupFile(group: string): string;
  /** A group's schemas or types file. */
  groupSchemaFile(group: string, kind: SchemaFileKind): string;
  /** How a file in the import's directory imports a module of a group: `./<dir>/<module>`. */
  groupSpecifier(group: string, module: "index" | SchemaFileKind): string;
  /** How a group's file imports a group generated inside it: `../<dir>/index`. */
  innerGroupSpecifier(group: string): string;
}

/**
 * Lay out an import's files. The source binding is the declared
 * `sourceName`, or the import's key when there is none; its directory, and
 * each group's, are named by {@link directoryName}.
 *
 * @param placement - The import's `outputDir` and `sourceName`
 * @param importName - The import's key under `imports`
 * @returns The layout
 * @throws {InvalidImportError} When the import's name, the directory or the name the source takes is refused,
 * and, from a group method, when a group name is not a binding
 * @example
 * ```ts
 * const layout = resolveImportLayout({ outputDir: "./src/api/" }, "petStore");
 * layout.dir; // "src/api/pet-store"
 * layout.groupFile("webHooks"); // "src/api/pet-store/web-hooks/index.ts"
 * ```
 */
export function resolveImportLayout(placement: ImportPlacement, importName: string): ImportLayout {
  checkImportName(importName);
  const sourceBinding = bindingFor(placement.sourceName, importName);
  const outputDir = canonicalOutputDir(placement.outputDir);
  const dir = posix.join(outputDir, directoryName(sourceBinding));
  const inDir = (...names: string[]): string => posix.join(dir, ...names);
  const groupDirName = (group: string): string => directoryName(requireGroupBinding(group));
  return {
    importName,
    sourceBinding,
    outputDir,
    dir,
    sourceFile: inDir("source.ts"),
    indexFile: inDir("index.ts"),
    proxyFile: inDir("proxy.ts"),
    schemaFile: (kind) => inDir(`${kind}.ts`),
    groupDir: (group) => inDir(groupDirName(group)),
    groupFile: (group) => inDir(groupDirName(group), "index.ts"),
    groupSchemaFile: (group, kind) => inDir(groupDirName(group), `${kind}.ts`),
    groupSpecifier: (group, module) => `./${groupDirName(group)}/${module}`,
    innerGroupSpecifier: (group) => `../${groupDirName(group)}/index`,
  };
}

function bindingFor(sourceName: string | undefined, importName: string): string {
  const field: InvalidImportField = sourceName === undefined ? "importName" : "sourceName";
  const name = sourceName ?? importName;
  if (name.length > MAX_NAME_LENGTH) {
    throw new InvalidImportError(
      field,
      name.slice(0, 40),
      `it is longer than ${MAX_NAME_LENGTH} characters`,
    );
  }
  if (toCamelCase(name) === "") {
    throw new InvalidImportError(
      field,
      name,
      "it holds no ASCII letter or digit to name a binding with",
    );
  }
  return offLimitsChecked(field, name, toBindingName(name));
}

function requireGroupBinding(group: string): string {
  if (!GROUP_BINDING.test(group)) {
    throw new InvalidImportError("group", group, "a group is named by an identifier");
  }
  if (group.length > MAX_NAME_LENGTH) {
    throw new InvalidImportError(
      "group",
      group.slice(0, 40),
      `it is longer than ${MAX_NAME_LENGTH} characters`,
    );
  }
  return offLimitsChecked("group", group, group);
}

/* A folder named like one Studio never writes into is refused, whatever names it. */
function offLimitsChecked(field: InvalidImportField, name: string, binding: string): string {
  const folder = directoryName(binding);
  if (STUDIO_OFF_LIMITS.has(folder)) {
    throw new InvalidImportError(field, name, `generated files do not belong in ${folder}`);
  }
  return binding;
}

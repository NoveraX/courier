import type { CourierConfig } from "@noverax/courier/config";
import { ConfigLoaderError } from "./config-loader-errors";
import { describeValue } from "./describe-value";
import { importEntryProblem } from "./import-entry-problem";
import { isPlainObject } from "./is-plain-object";
import { isRecord } from "./mocks-edit/is-record";
import type { ProjectInputs } from "./read-project-inputs";
import { studioBlockProblem } from "./studio-block-problem";

/**
 * Check that a config file's default export is a config Studio can load: an
 * object whose `sources` is a plain object of named sources, each one an
 * object.
 *
 * `sources` may be empty: that is a project with no source yet, which loads
 * so Studio can import its first API into it. It must be a plain object — an
 * object literal, `Object.create(null)`, or the module namespace that
 * `import * as apis` gives — because its own enumerable keys are the names
 * of its sources. A Map, a Set or a Promise holds its entries outside its
 * own keys, so it would load as a project without sources and drop the ones
 * it holds. It is refused, as is every other object with a prototype of its
 * own, a class instance included, and the message names what it is.
 *
 * @param config - The config file's default export
 * @param configFile - Absolute path of the config file, carried by the error
 * @param depHashes - What the load read before evaluating, carried by the error
 * @returns Nothing; it returns only when `config` is a `CourierConfig`
 * @throws `ConfigLoaderError` with code `CONFIG_INVALID`, saying what is wrong
 * @example
 * ```ts
 * validateCourierConfig(evaluated.config, configFile, depHashes);
 * stampSourceKeys(evaluated.config.sources);
 * ```
 */
export function validateCourierConfig(
  config: unknown,
  configFile: string,
  depHashes: ProjectInputs,
): asserts config is CourierConfig {
  const invalid = (message: string) =>
    new ConfigLoaderError("CONFIG_INVALID", message, { context: { configFile }, depHashes });
  if (!isRecord(config)) throw invalid("courier.config must export an object");
  const { sources } = config;
  if (sources === undefined || sources === null) {
    throw invalid("courier.config.sources is required; declare `sources: {}` while there are none");
  }
  if (!isPlainObject(sources)) {
    throw invalid(
      `courier.config.sources is ${describeValue(sources)}, not an object of named sources`,
    );
  }
  /* A named import misspelled, or one its module stopped exporting, is
     `undefined` here rather than an error of the import itself. */
  for (const [key, source] of Object.entries(sources)) {
    if (isRecord(source)) continue;
    throw invalid(
      `courier.config.sources.${key} is ${describeValue(source)}, not a source; check that it is imported by the name its module exports`,
    );
  }
  const problem = importsProblem(config.imports) ?? studioBlockProblem(config.studio);
  if (problem !== null) throw invalid(problem);
}

/* What is wrong with `imports`, if anything: it is optional, and each entry is checked as `CourierImportEntry` declares it. */
function importsProblem(imports: unknown): string | null {
  if (imports === undefined) return null;
  if (!isPlainObject(imports)) {
    return `courier.config.imports is ${describeValue(imports)}, not an object of named imports`;
  }
  for (const [name, entry] of Object.entries(imports)) {
    const problem = importEntryProblem(entry);
    if (problem === null) continue;
    return `courier.config.imports.${name}${problem.startsWith("is ") ? " " : "."}${problem}`;
  }
  return null;
}

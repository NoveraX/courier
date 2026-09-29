import type { CourierConfig } from "@noverax/courier/config";
import { ConfigLoaderError } from "./config-loader-errors";
import { importEntryProblem } from "./import-entry-problem";
import { isPlainObject } from "./is-plain-object";
import { isRecord } from "./mocks-edit/is-record";
import type { ProjectInputs } from "./read-project-inputs";
import { specHostEntryProblem } from "./spec-host-entry-problem";

/* "U" is left out: the names that start with it, Uint8Array and URL among
   them, take "a". */
const TAKES_AN = /^[AEIO]/;

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
    throw invalid(`courier.config.sources is ${describe(sources)}, not an object of named sources`);
  }
  /* A named import misspelled, or one its module stopped exporting, is
     `undefined` here rather than an error of the import itself. */
  for (const [key, source] of Object.entries(sources)) {
    if (isRecord(source)) continue;
    throw invalid(
      `courier.config.sources.${key} is ${describe(source)}, not a source; check that it is imported by the name its module exports`,
    );
  }
  const problem = importsProblem(config.imports) ?? studioProblem(config.studio);
  if (problem !== null) throw invalid(problem);
}

/* What is wrong with the `studio` block Studio reads here, if anything. */
function studioProblem(studio: unknown): string | null {
  if (studio === undefined) return null;
  if (!isPlainObject(studio)) return `courier.config.studio is ${describe(studio)}, not an object`;
  const hosts = studio.allowedSpecHosts;
  if (hosts === undefined) return null;
  if (!Array.isArray(hosts)) {
    return `courier.config.studio.allowedSpecHosts is ${describe(hosts)}, not a list of hosts`;
  }
  const entries: unknown[] = hosts;
  for (const [index, entry] of entries.entries()) {
    const problem = specHostEntryProblem(entry);
    if (problem !== null) return `courier.config.studio.allowedSpecHosts[${index}] ${problem}`;
  }
  return null;
}

/* What is wrong with `imports`, if anything: it is optional, and each entry is checked as `CourierImportEntry` declares it. */
function importsProblem(imports: unknown): string | null {
  if (imports === undefined) return null;
  if (!isPlainObject(imports)) {
    return `courier.config.imports is ${describe(imports)}, not an object of named imports`;
  }
  for (const [name, entry] of Object.entries(imports)) {
    const problem = importEntryProblem(entry);
    if (problem === null) continue;
    return `courier.config.imports.${name}${problem.startsWith("is ") ? " " : "."}${problem}`;
  }
  return null;
}

function describe(value: unknown): string {
  if (value === undefined || value === null) return String(value);
  if (Array.isArray(value)) return "an array";
  if (!isRecord(value)) return `a ${typeof value}`;
  const tag = Object.prototype.toString.call(value).slice("[object ".length, -1);
  if (tag !== "Object") return `${TAKES_AN.test(tag) ? "an" : "a"} ${tag}`;
  const name = constructorName(Object.getPrototypeOf(value));
  return name === null ? "an object with a prototype of its own" : `an instance of ${name}`;
}

/* Only a constructor the prototype holds itself names the object: one it
   inherits would call `Object.create({})` an instance of Object. */
function constructorName(proto: unknown): string | null {
  if (!isRecord(proto) || !Object.hasOwn(proto, "constructor")) return null;
  const ctor = proto.constructor;
  return typeof ctor === "function" && ctor.name !== "" ? ctor.name : null;
}

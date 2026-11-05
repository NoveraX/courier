/**
 * Why a project's config — or its mocks file — did not load, told from what
 * the load left: the error, the module cache that holds every module it
 * ran, and the transforms that failed. One explanation for every loader, so
 * the CLI, Studio and a bundler plugin say the same of the same project.
 */

import { basename, dirname } from "node:path";

import type { ModuleCache } from "jiti";

import { projectFramework } from "../frameworks";
import { profileOf } from "../profiles/profile-of";
import { RefusedModuleError } from "../profiles/refused-module-error";
import type { ResolutionProfile } from "../profiles/resolution-profile";
import { ConfigLoadError, type ConfigLoadErrorCode } from "./config-load-error";
import { importChain, packageOfFile, shownChain, shownModule } from "./import-chain";
import { evaluationHint, notFoundHint, TIMEOUT_HINT, TRANSFORM_HINT } from "./load-hints";
import { maskedError } from "./mask-env-values";
import { described, failedTransform, missingImport } from "./read-failure";
import { shownText } from "./shown-text";

/** What a loader knows of a load that failed. */
export interface FailedLoad {
  /** The file loaded, absolute: `courier.config.*` or `courier.mocks.*`. */
  readonly entry: string;
  /** The load's module cache, which tells the chain of imports; none, and the chain is the entry. */
  readonly cache?: ModuleCache | undefined;
  /** The entry's key in the cache, when the loader registered it under another than its path. */
  readonly entryKey?: string | undefined;
  /** The framework Courier read the project as; left out, the one the entry's package.json lists. */
  readonly profile?: ResolutionProfile | undefined;
  /** The package.json that told the framework, absolute. */
  readonly manifest?: string | undefined;
  /** Each module whose transform failed in the load, by file, with what the transformer said. */
  readonly transformFailures?: ReadonlyMap<string, unknown> | undefined;
}

/**
 * The load error that says why a load failed, what to do, and where — the
 * chain of imports from the entry to the module that failed.
 *
 * @param error - What the load threw
 * @param load - What the loader knows of the load
 * @returns The error, typed: an error that already is one is handed back
 * @example
 * ```ts
 * try { await jiti.evalModule(source, { filename: file, cache }); }
 * catch (error) { throw configLoadError(error, { entry: file, cache }); }
 * ```
 */
export function configLoadError(error: unknown, load: FailedLoad): ConfigLoadError {
  if (error instanceof ConfigLoadError) return error;
  const known = knownOf(load);
  const { cache, entryKey } = known;
  if (error instanceof RefusedModuleError) {
    const chain = importChain(cache, entryKey);
    return failure(known, "MODULE_REFUSED", error, chain, error.context.specifier, {
      what: `imports "${error.context.specifier}": it ${error.reason}`,
      hint: `${error.remedy}.`,
    });
  }
  const compiled = failedTransform(error, load.transformFailures);
  if (compiled !== undefined) {
    const chain = importChain(cache, entryKey, compiled.file);
    const at = compiled.line === undefined ? "" : `:${compiled.line}:${compiled.column ?? 0}`;
    return failure(known, "TRANSFORM_FAILED", error, chain, undefined, {
      who: `${shownModule(compiled.file, known.folder)}${at}`,
      what: `cannot be compiled: ${shownText(compiled.said)}`,
      hint: TRANSFORM_HINT,
    });
  }
  const missing = missingImport(error);
  if (missing !== undefined) {
    const chain = importChain(cache, entryKey, missing.importer);
    const inPackage =
      missing.importer === undefined ? undefined : packageOfFile(missing.importer, known.folder);
    /* A package Node loaded is in no cache of the loader's; one it ran itself is there by its file. */
    if (
      inPackage !== undefined &&
      !chain.some((link) => packageOfFile(link, known.folder) === inPackage)
    ) {
      chain.push(inPackage);
    }
    return failure(known, "MODULE_NOT_FOUND", error, chain, missing.specifier, {
      what: `imports "${missing.specifier}", which does not resolve`,
      hint: notFoundHint(missing.specifier, known.profile, {
        manifest: known.manifest,
        folder: known.folder,
      }),
    });
  }
  return failure(known, "EVALUATION_FAILED", error, importChain(cache, entryKey), undefined, {
    what: `threw ${described(error)}`,
    hint: evaluationHint(error, known.profile, basename(load.entry)),
  });
}

/**
 * The load error for a load given up after its time: the evaluation goes on
 * — nothing stops a module's top-level code — and the process that gave up
 * on it ends rather than wait.
 *
 * @param load - What the loader knows of the load
 * @param limitMs - How long it was given
 * @returns The error
 * @example
 * ```ts
 * reject(loadTimedOut({ entry: configFile }, 60_000));
 * ```
 */
export function loadTimedOut(load: FailedLoad, limitMs: number): ConfigLoadError {
  const known = knownOf(load);
  const chain = importChain(known.cache, known.entryKey);
  const where = chain.length > 1 ? ` (${shownChain(chain, known.folder)})` : "";
  return new ConfigLoadError(
    "LOAD_TIMED_OUT",
    `${basename(load.entry)} was still loading after ${limitMs / 1000} s and was given up${where}.`,
    {
      context: { entry: load.entry, specifier: undefined, importChain: chain },
      hint: TIMEOUT_HINT,
    },
  );
}

/* What is known of a load: its folder, cache, profile and the package.json that chose it. */
interface KnownLoad {
  readonly entry: string;
  readonly folder: string;
  readonly cache: ModuleCache;
  readonly entryKey: string;
  readonly profile: ResolutionProfile;
  readonly manifest: string | undefined;
}

function knownOf(load: FailedLoad): KnownLoad {
  const folder = dirname(load.entry);
  const detected = load.profile === undefined ? projectFramework(folder) : undefined;
  return {
    entry: load.entry,
    folder,
    cache: load.cache ?? {},
    entryKey: load.entryKey ?? load.entry,
    profile: load.profile ?? profileOf(detected?.framework),
    manifest: load.manifest ?? detected?.manifest,
  };
}

function failure(
  known: KnownLoad,
  code: ConfigLoadErrorCode,
  cause: unknown,
  chain: string[],
  specifier: string | undefined,
  said: { readonly who?: string; readonly what: string; readonly hint: string },
): ConfigLoadError {
  const who = said.who ?? shownModule(chain.at(-1) ?? known.entry, known.folder);
  const where = chain.length > 1 ? ` (${shownChain(chain, known.folder)})` : "";
  const message = `${who} ${said.what}${where}.`;
  return new ConfigLoadError(code, message, {
    context: { entry: known.entry, specifier, importChain: chain },
    hint: said.hint,
    /* Courier's own refusal holds no variable's value; what the project threw may. */
    cause: cause instanceof RefusedModuleError ? cause : maskedError(cause),
  });
}

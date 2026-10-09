import type { CourierConfig } from "@noverax/courier/config";

import { deriveSourceName } from "@/features/apis/derive-source-name";
import { type ParsedSpec, parseSpec } from "../../apis";
import { resolveBaseURL } from "../../apis/resolve-base-url";
import { specTypeOf } from "../../server/import-declaration-parts";
import { refuseUnsendable } from "../../server/refuse-unsendable";
import type { WriteBody } from "../../server/write-types";
import { type ImportFlags, importOptions } from "./import-options";
import type { SpecInput } from "./read-spec-input";
import { checkDeclaredSelectors, selectedBy } from "./selection";

/** What `import` was told on the command line, beside the specification. */
export interface ImportRun extends ImportFlags {
  name?: string | undefined;
  yes?: boolean | undefined;
  "dry-run"?: boolean | undefined;
  declare?: boolean | undefined;
  confirm?: string | undefined;
  cwd?: string | undefined;
}

function specOf(input: SpecInput): ParsedSpec {
  const parsed = parseSpec(input.raw);
  const spec = input.url === undefined ? parsed : resolveBaseURL(parsed, input.url);
  refuseUnsendable(spec);
  return spec;
}

/**
 * The import the command asks for, as Import API sends it to be written:
 * the specification parsed — its base URL resolved against the URL it came
 * from — named after it unless `--name` names it, with the options typed
 * and the endpoints `--include` and `--exclude` pick.
 *
 * @param input - The specification as read
 * @param run - The options typed
 * @param config - The project's config, whose `imports` may declare the import already
 * @returns The request
 * @throws {Error} When an option holds a value it does not take, or the selectors contradict the config's
 * @example
 * ```ts
 * const body = importRequest(await readSpecInput(given, project, root), run, loaded.config);
 * ```
 */
export function importRequest(input: SpecInput, run: ImportRun, config: CourierConfig): WriteBody {
  const spec = specOf(input);
  const name = run.name ?? deriveSourceName(spec, input.url);
  const options = importOptions(run, name, specTypeOf(spec));
  checkDeclaredSelectors(name, config.imports?.[name], options);
  return {
    sourceName: name,
    spec,
    importType: input.importType,
    ...(input.url !== undefined && { specUrl: input.url }),
    options: { ...options, selectedEndpoints: selectedBy(spec, options) },
  };
}

import { configObjectPath } from "../agents-policy-edit";
import { defaultExportLiteral, type Literal, properties, propertyLiteral } from "../edit/literal";
import { codeMatches, nextCode, type SourceScan, scanSource } from "../edit/source-scan";
import type { Project } from "./read-project";

/** The APIs a project's config declares already. */
export interface ConfiguredSources {
  /** The file that holds the config's object: courier.config.ts, or the module it passes it on from. */
  readonly path: string;
  /** The APIs' names, as the config writes them. */
  readonly names: readonly string[];
  /** Whether the config declares more than it names: a spread, or a list built elsewhere. */
  readonly more: boolean;
}

/* The object the config exports: `export default defineConfig({…})`, `export default {…}`, or the one `defineConfig` is called with. */
function configObject(scan: SourceScan): Literal | undefined {
  const exported = defaultExportLiteral(scan, ["defineConfig"]);
  if (exported !== undefined) return scan.text[exported.open] === "{" ? exported : undefined;
  const calls = codeMatches(scan, /\bdefineConfig\s*\(/g);
  if (calls.length !== 1 || calls[0] === undefined) return undefined;
  const open = nextCode(scan, calls[0].index + calls[0][0].length);
  const close = scan.closer.get(open);
  return scan.text[open] === "{" && close !== undefined ? { open, close } : undefined;
}

/* The names a `sources` object lists — a key, or a shorthand's name — and whether a spread adds more. */
function namesOf(scan: SourceScan, sources: Literal): { names: string[]; more: boolean } {
  const names: string[] = [];
  let more = false;
  for (const property of properties(scan, sources)) {
    if (property.key !== "") names.push(property.key);
    else {
      const shorthand = /^([A-Za-z_$][\w$]*)\s*$/.exec(
        scan.text.slice(property.value, nextUntil(scan, property.value, sources.close)),
      );
      if (shorthand?.[1]) names.push(shorthand[1]);
      else more = true;
    }
  }
  return { names, more };
}

/* Where a property that starts at `from` ends: its comma, or the object's close. */
function nextUntil(scan: SourceScan, from: number, close: number): number {
  for (let at = from; at < close; at++) {
    if (scan.code[at] === 1 && scan.text[at] === ",") return at;
  }
  return close;
}

/**
 * The APIs the project's config declares already, read from its code: the
 * `sources` of the object `courier.config.ts` exports — or of the module
 * it passes its default export on from. A config without them, or with an
 * empty `sources`, declares none; `sources` set to something other than an
 * object written there declares some, which are not named.
 *
 * @param project - The project
 * @returns What the config declares, or `undefined` where it declares no API
 * @example
 * ```ts
 * configuredSources(project); // { path: "courier.config.ts", names: ["site", "catalog"], more: false }
 * ```
 */
export function configuredSources(project: Project): ConfiguredSources | undefined {
  const path = configObjectPath(project);
  const text = project.read(path);
  const scan = text === undefined ? undefined : scanSource(text);
  const config = scan === undefined ? undefined : configObject(scan);
  if (scan === undefined || config === undefined) return undefined;
  const sources = propertyLiteral(scan, config, "sources");
  if (sources === null) return undefined;
  if (sources === undefined || scan.text[sources.open] !== "{")
    return { path, names: [], more: true };
  const { names, more } = namesOf(scan, sources);
  return names.length === 0 && !more ? undefined : { path, names, more };
}

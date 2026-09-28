import type { CourierConfig } from "@noverax/courier/config";
import { deriveSourceName } from "@noverax/courier/define";
import { extractSourceMap } from "@noverax/courier-studio-core";

/** What a runtime reports a call against: its source, group and method names. */
export interface ReportedEndpoint {
  source: string;
  group: string | undefined;
  method: string;
}

/** Names the config source a reported endpoint belongs to. */
export type ConfigSourceNamer = (reported: ReportedEndpoint) => string;

interface Candidate {
  key: string;
  /** The name `defineApi` gives this source's definition when it has none of its own. */
  derived: string;
  /** Method names by group name; flat endpoints sit under the group `""`. */
  endpoints: ReadonlyMap<string, ReadonlySet<string>>;
}

interface NameIndex {
  keys: ReadonlySet<string>;
  candidates: readonly Candidate[];
}

/** What a direct call reports when its API carries no name at all. */
const UNNAMED = "_";

/**
 * Name events by the config key of the source they were made against.
 *
 * A runtime reports the name its own copy of a definition carries. A copy
 * the runtime registered carries its config key; any other — every copy in a
 * browser, and a server's own import of the module the config also imports —
 * carries what `defineApi` derived from the baseURL host, such as
 * `"localhost"` or `"127"`. That named a source Studio has never heard of,
 * split each endpoint in two, and merged every source on the host into one.
 *
 * A reported name that is a config key stands. Otherwise the call is
 * attributed to the one config source whose definition derives that name and
 * declares the endpoint that was called; when none does, or several do, the
 * reported name stands, since guessing would attribute it to the wrong one.
 *
 * @param currentConfig - The config Studio runs now, or `undefined` while it runs none
 * @returns A namer that reads the config it is handed on each call
 * @example
 * ```ts
 * const nameOf = createConfigSourceNamer(() => project.snapshot().running?.config);
 * nameOf({ source: "localhost", group: "users", method: "list" }); // → "api"
 * ```
 */
export function createConfigSourceNamer(
  currentConfig: () => CourierConfig | undefined,
): ConfigSourceNamer {
  const indexes = new WeakMap<CourierConfig, NameIndex>();

  return ({ source, group, method }) => {
    const config = currentConfig();
    if (!config) return source;
    let index = indexes.get(config);
    if (!index) {
      index = indexConfig(config);
      indexes.set(config, index);
    }
    if (index.keys.has(source)) return source;
    const matches = index.candidates.filter(
      (candidate) =>
        (source === UNNAMED || candidate.derived === source) &&
        candidate.endpoints.get(group ?? "")?.has(method) === true,
    );
    return matches.length === 1 && matches[0] ? matches[0].key : source;
  };
}

function indexConfig(config: CourierConfig): NameIndex {
  const sourceMap = extractSourceMap(config.sources);
  const candidates: Candidate[] = [];
  for (const [key, source] of Object.entries(sourceMap)) {
    const endpoints = new Map<string, ReadonlySet<string>>();
    for (const [groupName, group] of Object.entries(source.groups)) {
      endpoints.set(groupName, new Set(Object.keys(group.endpoints)));
    }
    candidates.push({ key, derived: deriveSourceName(source.baseURL), endpoints });
  }
  return { keys: new Set(Object.keys(sourceMap)), candidates };
}

import type { EndpointCall, EndpointStats } from "../studio/studio-api";

/** How the hints reach Studio: what finds it, and what asks it. */
export interface HintSources {
  findStudio(file: string, workspace: string): Promise<string | undefined>;
  fetchStats(studio: string): Promise<EndpointStats[]>;
  fetchCalls(studio: string, file: string, text: string): Promise<EndpointCall[]>;
}

/** A file as the hints read it: its path, its version and its text. */
export interface HintDocument {
  readonly file: string;
  readonly version: number;
  readonly text: string;
  /** The workspace folder it is in, where looking for Studio stops */
  readonly workspace: string;
}

/** The calls in a file, and the Studio that placed them. */
export interface PlacedCalls {
  readonly studio: string;
  readonly calls: readonly EndpointCall[];
}

/** What the editor's hints know of Studio and of the files' calls. */
export interface HintStore {
  /** The calls in a file, placed by Studio — asked again only for a new version of the file */
  callsIn(document: HintDocument): Promise<PlacedCalls | undefined>;
  /** How an endpoint's calls went in a Studio, as last asked */
  statsOf(studio: string, source: string, endpoint: string): EndpointStats | undefined;
  /** Ask each Studio known again; whether anything a hint shows changed */
  refresh(): Promise<boolean>;
  /** Whether a Studio answers: a file left by one that stopped without cleaning up names one that does not */
  answers(studio: string): Promise<boolean>;
  /** Forget every file's calls, so each is asked again: Studio started, or the config changed */
  forgetCalls(): void;
}

/* A file's calls are asked again only once it changes; this many files are remembered. */
const FILES_KEPT = 200;

/**
 * What the editor's hints know: the calls in each file — asked of Studio
 * once per version of the file — and how each endpoint's calls went in
 * each Studio, brought up to date by `refresh`. Studio not running is no
 * error: a file then has no calls, and nothing shows.
 *
 * @param sources - What finds Studio and asks it
 * @returns The store
 * @example
 * ```ts
 * const store = createHintStore({ findStudio, fetchStats: fetchEndpointStats, fetchCalls });
 * const placed = await store.callsIn(document);
 * ```
 */
export function createHintStore(sources: HintSources): HintStore {
  const files = new Map<string, { version: number; placed: Promise<PlacedCalls | undefined> }>();
  const stats = new Map<string, Map<string, EndpointStats>>();
  const statsKey = (source: string, endpoint: string) => `${source}\u0000${endpoint}`;

  async function place(document: HintDocument): Promise<PlacedCalls | undefined> {
    const studio = await sources.findStudio(document.file, document.workspace);
    if (!studio) return undefined;
    if (!stats.has(studio)) await refreshStudio(studio);
    try {
      return { studio, calls: await sources.fetchCalls(studio, document.file, document.text) };
    } catch {
      /* Studio stopped between finding it and asking it: no hints until it is back. */
      return undefined;
    }
  }

  async function refreshStudio(studio: string): Promise<boolean> {
    let fresh: EndpointStats[];
    try {
      fresh = await sources.fetchStats(studio);
    } catch {
      const had = stats.delete(studio);
      return had;
    }
    const next = new Map(fresh.map((s) => [statsKey(s.source, s.endpoint), s]));
    const before = stats.get(studio);
    stats.set(studio, next);
    return !before || !sameStats(before, next);
  }

  return {
    callsIn(document) {
      const known = files.get(document.file);
      if (known && known.version === document.version) return known.placed;
      const placed = place(document);
      files.delete(document.file);
      files.set(document.file, { version: document.version, placed });
      if (files.size > FILES_KEPT) files.delete(files.keys().next().value ?? "");
      return placed;
    },
    statsOf(studio, source, endpoint) {
      return stats.get(studio)?.get(statsKey(source, endpoint));
    },
    async answers(studio) {
      await refreshStudio(studio);
      return stats.has(studio);
    },
    async refresh() {
      const changed = await Promise.all([...stats.keys()].map((studio) => refreshStudio(studio)));
      return changed.some(Boolean);
    },
    forgetCalls() {
      files.clear();
    },
  };
}

function sameStats(
  a: ReadonlyMap<string, EndpointStats>,
  b: ReadonlyMap<string, EndpointStats>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    const other = b.get(key);
    if (
      !other ||
      other.calls !== value.calls ||
      other.failed !== value.failed ||
      other.pending !== value.pending ||
      other.p95 !== value.p95
    ) {
      return false;
    }
  }
  return true;
}

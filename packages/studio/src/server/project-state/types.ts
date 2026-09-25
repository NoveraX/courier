import type { ConfigLoaderErrorCode, LoadedCourierConfig } from "../config-loader";
import type { ExclusiveTransaction } from "../exclusive-reload";

/** Why the latest load of the config failed. */
export interface ConfigFailure {
  /** The loader's code, or `UNKNOWN` for anything it did not raise itself. */
  readonly code: ConfigLoaderErrorCode | "UNKNOWN";
  /** One line, with paths relative to the project root. */
  readonly message: string;
  /** When the load failed, in epoch milliseconds. */
  readonly at: number;
  /** What was thrown, whole: the terminal log and the mock wizard keep it. */
  readonly cause: unknown;
}

/**
 * The project as Studio runs it, at one moment. Every outcome of a load
 * replaces it, applied or failed; it is never changed in place.
 */
export interface ProjectSnapshot {
  /** One more for each outcome; `0` while there has been none. */
  readonly revision: number;
  /** No load has had an outcome yet. */
  readonly starting: boolean;
  /** The last load that succeeded: what the binding table and the mocks run. */
  readonly running: LoadedCourierConfig | null;
  /** When `running` was applied, in epoch milliseconds. */
  readonly loadedAt: number | null;
  /** Why the latest load failed; `null` while `running` is the latest. */
  readonly failure: ConfigFailure | null;
}

/** The project once Studio has caught up with the disk, or given up waiting to. */
export interface FreshSnapshot extends ProjectSnapshot {
  /**
   * Studio could not catch up within the budget — a load or an edit is still
   * under way, or files are still being saved — and this is the project as
   * Studio runs it meanwhile, which may be older than what is on disk.
   */
  readonly settling: boolean;
}

/** What a reader of the project may ask for. */
export interface ProjectReads {
  /**
   * The project as Studio runs it now. Never loads, never waits: for a push
   * to a UI, which the next outcome corrects.
   */
  snapshot(): ProjectSnapshot;
  /**
   * The project as Studio runs it once it has caught up with the saves on
   * disk: after the first load, every watched file is compared with the
   * disk, and a change is reloaded without waiting out the debounce. Files
   * still being saved — one save made in two steps, or a burst across files
   * — are waited for until they are whole, so they are not loaded
   * half-written; what is queued after that reload is not waited for. It
   * waits at most `budgetMs`, and then answers with the project as Studio
   * runs it, `settling` set, as it does while saves never pause.
   *
   * @param budgetMs - How long to wait at most
   * @returns The project, caught up unless `settling`
   * @throws {ProjectStateError} `FRESH_INSIDE_EDIT` at once when called from
   *   inside an edit, which holds the chain it would wait for
   */
  fresh(budgetMs: number): Promise<FreshSnapshot>;
}

/** The one owner of the project Studio runs: nothing else loads it for its own use. */
/** What the imports routes need of the project: its reads, and a way to announce what they wrote. */
export interface ProjectImports extends ProjectReads {
  /**
   * Send every UI the imports lists anew, after a route wrote the imports
   * state. Nothing is sent while Studio starts, and a failure to send is
   * logged, never thrown at the route that wrote.
   */
  importsChanged(): void;
}

export interface ProjectState extends ProjectImports {
  /**
   * Run an edit of the watched files alone on the reload chain, after the
   * first load and every reload queued before it.
   *
   * @param transaction - The edit
   * @param timeoutMs - How long one `load` inside it may take
   * @param dropped - Aborted when the caller gave up before the edit started
   */
  runExclusive<TResult>(
    transaction: ExclusiveTransaction<TResult>,
    timeoutMs: number,
    dropped?: AbortSignal,
  ): Promise<TResult>;
  /**
   * Let an edit under way finish, for at most `budgetMs`. Every edit that
   * has not started, and every later one, is refused with
   * `CONFIG_WATCHER_STOPPED` and never runs, so none is waited for.
   */
  finishEdits(budgetMs: number): Promise<void>;
  /** Stop watching; outcomes of loads still running are dropped. */
  stop(): void;
}

/** Where the project is told: every UI through the namespace, or the one socket that connected. */
export interface ProjectEventTarget {
  emit(event: string, payload: unknown): unknown;
}

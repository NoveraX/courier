import { type FileSignature, signatureOf } from "./file-signature";

/** When a watch set reports changes, and which ones it has already reported. */
export interface ChangeLedgerOptions {
  /** How long a burst of changes is left to settle before it is reported. */
  debounceMs: number;
  /** Receives every path that changed since the previous call. */
  onChange: (changed: string[]) => void;
}

/**
 * The state each watched path was last reported at, and the changes waiting
 * to be reported.
 *
 * The native and the poll layer see the same edit, so a notification for a
 * state already reported is dropped; without that, one save surfaces twice.
 */
export interface ChangeLedger {
  /** Take a path as seen in the state given, or its present one. */
  baseline(path: string, signature?: FileSignature): void;
  /** A notification for a path: report it once the burst settles, unless its state was reported. */
  record(path: string): void;
  /**
   * Report these paths now, together with every change still waiting, each
   * taken as seen in the state given, so a notification of that same state
   * is dropped.
   */
  markChanged(changes: ReadonlyMap<string, FileSignature>): void;
  /**
   * Report these paths now, together with every change still waiting, even
   * when there are none of the first; each is taken as seen in the state
   * given, so a notification of that same state is dropped.
   */
  report(changes: ReadonlyMap<string, FileSignature>): void;
  /** Each of these paths whose state now differs from the one last reported, with that state. */
  unreported(paths: readonly string[]): Map<string, FileSignature>;
  /** The paths whose change is waiting out the debounce. */
  waiting(): string[];
  /** Take a path as seen in its present state, dropping a change waiting for it. */
  acknowledge(path: string): void;
  /** Stop tracking a path. */
  forget(path: string): void;
  /** The platform dropped events: take every path given as changed. */
  markAll(paths: readonly string[]): void;
  /** Report nothing more. */
  stop(): void;
}

/**
 * Keep the ledger of a watch set.
 *
 * @param options - The debounce, and where changes are reported
 * @returns The ledger
 *
 * @example
 * ```ts
 * const ledger = createChangeLedger({ debounceMs: 100, onChange: (paths) => reload(paths) });
 * ledger.baseline("/app/courier.config.ts");
 * ```
 */
export function createChangeLedger({ debounceMs, onChange }: ChangeLedgerOptions): ChangeLedger {
  const pending = new Set<string>();
  /** path → the signature it was last reported at */
  const reportedAt = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function cancelTimer(): void {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function flush(): void {
    cancelTimer();
    if (stopped || pending.size === 0) return;
    const changed = [...pending];
    pending.clear();
    onChange(changed);
  }

  function schedule(): void {
    cancelTimer();
    timer = setTimeout(flush, debounceMs);
  }

  function report(changes: ReadonlyMap<string, FileSignature>): void {
    if (stopped) return;
    for (const [path, signature] of changes) {
      reportedAt.set(path, signature.key);
      pending.add(path);
    }
    flush();
  }

  return {
    baseline(path, signature = signatureOf(path)) {
      if (!stopped) reportedAt.set(path, signature.key);
    },
    record(path) {
      if (stopped) return;
      const { key } = signatureOf(path);
      if (reportedAt.get(path) === key) return;
      reportedAt.set(path, key);
      pending.add(path);
      schedule();
    },
    markChanged(changes) {
      if (changes.size > 0) report(changes);
    },
    report,
    unreported(paths) {
      const changes = new Map<string, FileSignature>();
      if (stopped) return changes;
      for (const path of paths) {
        const signature = signatureOf(path);
        if (reportedAt.get(path) !== signature.key) changes.set(path, signature);
      }
      return changes;
    },
    waiting: () => [...pending],
    acknowledge(path) {
      if (stopped) return;
      reportedAt.set(path, signatureOf(path).key);
      pending.delete(path);
    },
    forget(path) {
      reportedAt.delete(path);
    },
    markAll(paths) {
      if (stopped) return;
      for (const path of paths) {
        reportedAt.set(path, signatureOf(path).key);
        pending.add(path);
      }
      schedule();
    },
    stop() {
      stopped = true;
      cancelTimer();
      pending.clear();
      reportedAt.clear();
    },
  };
}

import type { ThreadBudget } from "./thread-budgets";

/** Whom a job on specifications is done for, and what bounds and stops it. */
export interface SpecWorkOptions {
  /** Whether the caller holds the project's token. */
  trusted: boolean;
  /** Aborted once the caller goes away: the thread is ended, or the job leaves the line. */
  signal?: AbortSignal | undefined;
  /** The time and memory the job may take, instead of the caller's own. */
  budget?: ThreadBudget | undefined;
}

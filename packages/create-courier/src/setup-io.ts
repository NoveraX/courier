import type { SetupReport } from "./report/setup-report";

/** Where a run tells what it does, and whether a person can answer its questions. */
export interface SetupIO {
  /** Whether a person at a terminal can answer: without one, nothing is asked. */
  readonly interactive: boolean;
  readonly report: SetupReport;
}

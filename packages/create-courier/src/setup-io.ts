import type { SetupReport } from "./report/setup-report";

/** Where a run tells what it does, and whether a person can answer its questions. */
export interface SetupIO {
  /** Whether a person at a terminal can answer: without one, nothing is asked. */
  readonly interactive: boolean;
  readonly report: SetupReport;
  /** Where the programs it runs show their output: the terminal's, or standard error while standard output carries the JSON document. */
  readonly toolOutput: "stdout" | "stderr";
}

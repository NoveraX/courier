import type { Questions } from "./questions/questions";
import type { SetupReport } from "./report/setup-report";

/** Where a run tells what it does, and what it asks the person. */
export interface SetupIO {
  /** What a person at a terminal answers; none without one, and nothing is asked. */
  readonly questions: Questions | undefined;
  readonly report: SetupReport;
  /** Where the programs it runs show their output: the terminal's, or standard error while standard output carries the JSON document. */
  readonly toolOutput: "stdout" | "stderr";
}

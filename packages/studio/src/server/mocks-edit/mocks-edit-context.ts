import type { MockSummary } from "../mock-manager/types";
import type { ProjectState } from "../project-state/types";

/** What editing the mocks file needs from the running Studio. */
export interface MocksEditContext {
  projectRoot: string;
  /** Where the ports Studio assigns begin, as Studio read it when it started. */
  mockBasePort(): number;
  /** The project Studio runs, and the reload chain an edit holds. */
  project: ProjectState;
  /** The port Studio listens on, once it does. */
  studioPort(): number | null;
  /** Every mock Studio tracks. */
  mockSummaries(): MockSummary[];
}

import type { ConfigWatcher } from "../config-watcher";
import type { MockSummary } from "../mock-manager/types";

/** What editing the mocks file needs from the running Studio. */
export interface MocksEditContext {
  projectRoot: string;
  /** Where the ports Studio assigns begin. */
  mockBasePort: number;
  /** The config watcher, or `null` while Studio is still loading the config. */
  watcher(): ConfigWatcher | null;
  /** The port Studio listens on, once it does. */
  studioPort(): number | null;
  /** Every mock Studio tracks. */
  mockSummaries(): MockSummary[];
}

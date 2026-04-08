/** Configuration for presence adapters */
export interface PresenceConfig {
  /**
   * Interval in ms between automatic sweep runs.
   * Set to `0` to disable auto-sweep (manual `sweep()` only).
   * @default 30_000
   */
  sweepIntervalMs?: number;
  /**
   * Entries without a heartbeat for longer than this are considered stale.
   * Should be ~1.5× the heartbeat interval.
   * @default 45_000
   */
  staleThresholdMs?: number;
}

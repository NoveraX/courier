/**
 * What Studio tells a page of itself in `studio:info`, once it connects:
 * its version, when it started (epoch milliseconds), the project it runs —
 * by name, the project's package name or its folder's, and the packages it
 * depends on — and, when it serves a public demo, when the demo resets. It
 * mirrors the server's payload; `socket/studio-info-guard.ts` checks every
 * one before it reaches the store.
 */
export interface StudioInfo {
  version: string;
  startedAt: number;
  project: { name: string; dependencies: string[] };
  demo?: StudioDemoInfo | undefined;
}

/** How Studio runs as a public demo. */
export interface StudioDemoInfo {
  /** When the host resets the demo, in epoch milliseconds, when it says. */
  resetsAt?: number | undefined;
}

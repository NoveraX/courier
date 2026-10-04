/**
 * What Studio tells a page of itself in `studio:info`, once it connects:
 * its version, when it started (epoch milliseconds), and the project it
 * runs by name — the project's package name, or its folder's. It mirrors
 * the server's payload; `socket/studio-info-guard.ts` checks every one
 * before it reaches the store.
 */
export interface StudioInfo {
  version: string;
  startedAt: number;
  project: { name: string };
}

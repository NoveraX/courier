/**
 * How far an upgrade reads a project, and how long it waits on the
 * registry: every walk and every wait of the command is bounded here, in
 * one place. A limit reached is named in the plan; nothing past it is
 * skipped without a word.
 */
export const UPGRADE_LIMITS = {
  /** The packages of a workspace an upgrade reads. */
  workspacePackages: 1_000,
  /** How deep a workspace's `**` glob goes, in folders. */
  workspaceDepth: 8,
  /** One question to the registry: a release's version, or a package's. */
  registryMs: 30_000,
  /** The questions to the registry asked at once. */
  registryConcurrency: 4,
} as const;

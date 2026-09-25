/**
 * The ranges Studio accepts for a mock's numbers, and the seed count a new
 * draft starts with.
 */
export const DRAFT_LIMITS = {
  minPort: 1,
  maxPort: 65535,
  minSeedCount: 1,
  maxSeedCount: 1000,
  defaultSeedCount: 20,
} as const;

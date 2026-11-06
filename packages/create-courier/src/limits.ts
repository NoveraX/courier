/**
 * How long each program a setup runs may take, and how much of what it
 * prints is kept: every wait and every buffer of the command is bounded
 * here, in one place. A program past its time is stopped, and the setup
 * fails with what it was doing.
 */
export const SETUP_LIMITS = {
  /** An install of the setup's packages, or of a new project's own: a slow registry, a cold cache. */
  installMs: 20 * 60_000,
  /** A framework's generator making a new project, its own install among it. */
  generatorMs: 20 * 60_000,
  /** A program that writes the types the added files read, such as `astro sync`. */
  prepareMs: 5 * 60_000,
  /** Studio's import of a specification: fetching it, and writing the code it types. */
  importMs: 5 * 60_000,
  /** TypeScript checking one of the project's tsconfig projects. */
  typecheckMs: 5 * 60_000,
  /** git telling the state of the project's files. */
  gitMs: 10_000,
  /** Between asking a program past its time to stop and making it. */
  killGraceMs: 5_000,
  /** How many characters of the end of a program's output are kept, for its failure to show. */
  tailChars: 64 * 1024,
  /** The longest line of a program's output read whole, in characters; the rest of a longer one is left out. */
  lineChars: 64 * 1024,
} as const;

import { createLogger } from "@noverax/courier";

/* The first Node 22 whose built-in SQLite, where Studio keeps its data, needs no flag. */
const MINIMUM = { major: 22, minor: 13 } as const;

/**
 * Refuse a Node older than Studio needs, saying which it needs.
 *
 * @example
 * ```ts
 * checkNodeVersion(); // exits with an error on Node 22.12
 * ```
 */
export function checkNodeVersion(): void {
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  if (major > MINIMUM.major || (major === MINIMUM.major && minor >= MINIMUM.minor)) return;
  const log = createLogger("Studio");
  log.error(
    `Node.js >= ${MINIMUM.major}.${MINIMUM.minor} required. Current: ${process.versions.node}`,
  );
  process.exit(1);
}

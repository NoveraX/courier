import { portProblem } from "./port-problem";

const SEARCH_SPAN = 100;

async function isPortAvailable(port: number): Promise<boolean> {
  return (await portProblem(port)) === null;
}

/**
 * Find a free port for a mock Studio assigns one to.
 *
 * @param preferred - The port to try first; the next ones follow
 * @param avoid - Ports held for other mocks, skipped even when free
 * @returns The first free port not in `avoid`
 * @throws When none of the next ports is free
 */
export async function allocatePort(preferred: number, avoid: ReadonlySet<number>): Promise<number> {
  for (let port = preferred; port < preferred + SEARCH_SPAN; port++) {
    if (avoid.has(port)) continue;
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No free port from ${preferred} to ${preferred + SEARCH_SPAN - 1}.`);
}

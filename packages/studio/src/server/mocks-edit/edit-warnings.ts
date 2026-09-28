import type { LoadedCourierConfig } from "../config-loader";
import { portProblem } from "../mock-manager/port-problem";
import type { MockSummary } from "../mock-manager/types";
import { isRecord } from "./is-record";
import type { MockDeclaration } from "./types";

/** What an edit is about to change besides adding the mocks. */
export interface WarningInput {
  requests: readonly MockDeclaration[];
  loaded: LoadedCourierConfig;
  summaries: readonly MockSummary[];
  /** The mocks file, relative to the project root. */
  target: string;
  /** The running mocks the edit restarts: those whose declaration, or what it uses, it changes. */
  restarting: readonly string[];
  creates: boolean;
  mockBasePort: number;
}

/**
 * Say what the edit changes that the diff does not show.
 *
 * A running mock restarts when the edit changes its declaration or what that
 * uses, and the others keep running; a port another process holds stops the
 * new mock from starting; a port Studio assigns can differ after Studio
 * restarts.
 *
 * @param input - The requested mocks and what Studio runs now
 * @returns One sentence per effect, in a stable order
 */
export async function editWarnings(input: WarningInput): Promise<string[]> {
  const warnings: string[] = [];
  if (input.creates) warnings.push(`Studio creates ${input.target}.`);
  if (input.restarting.length > 0) {
    warnings.push(`Running mocks restart to pick up the edit: ${input.restarting.join(", ")}.`);
  }
  for (const request of input.requests) warnings.push(...(await requestWarnings(request, input)));
  return warnings;
}

async function requestWarnings(request: MockDeclaration, input: WarningInput): Promise<string[]> {
  const existing = existingMocksOf(request.source, input.loaded);
  const warnings =
    existing.length > 0
      ? [
          `${request.source} already has the mock ${existing.join(", ")}; ${request.key} serves it too.`,
        ]
      : [];
  if (request.port === null) {
    warnings.push(
      `${request.key} gets a port Studio assigns from ${input.mockBasePort}; it can differ after Studio restarts. Set a port to keep one.`,
    );
    return warnings;
  }
  const port = await portWarning(request, input.summaries);
  return port ? [...warnings, port] : warnings;
}

async function portWarning(
  request: MockDeclaration,
  summaries: readonly MockSummary[],
): Promise<string | null> {
  const holder = summaries.find((mock) => !mock.portDeclared && mock.port === request.port);
  if (holder) return `${holder.key} moves to another port: ${request.key} takes ${request.port}.`;
  const problem = request.port === null ? null : await portProblem(request.port);
  if (problem === "in use") {
    return `Port ${request.port} is in use now, so ${request.key} cannot start until it is free.`;
  }
  if (problem === "not permitted") {
    return `Port ${request.port} needs privileges Studio does not have, so ${request.key} cannot listen on it.`;
  }
  return null;
}

/* The mocks already serving a source: the entries holding the very source
   object the config declares, which holds since both load in one graph. */
function existingMocksOf(source: string, loaded: LoadedCourierConfig): string[] {
  const served = loaded.config.sources[source];
  return Object.entries(loaded.mocks.entries)
    .filter(([, entry]) => isRecord(entry) && entry.source === served)
    .map(([key]) => key);
}

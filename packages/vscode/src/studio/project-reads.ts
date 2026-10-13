import { fetchDefinitions, fetchGroups, fetchSites } from "./studio-api";
import type { CallSite, EndpointDefinition, GroupPlace } from "./studio-types";

/** The reads of the project's code that Studio answers only with the project's token. */
export interface ProjectReads {
  /** Where the project's code calls an endpoint */
  fetchSites(studio: string, source: string, endpoint: string): Promise<CallSite[]>;
  /** Where the project's files declare each endpoint */
  fetchDefinitions(studio: string): Promise<EndpointDefinition[]>;
  /** Where each group writes its endpoints */
  fetchGroups(studio: string): Promise<GroupPlace[]>;
}

/**
 * Ask Studio of the project's code with the token of the project each
 * Studio runs for, found again for every question: Studio writes it as it
 * starts, and a Studio started again keeps it. Without one — a Studio the
 * settings name, for a project outside the workspace — Studio refuses, and
 * each read throws a `StudioTokenRefusal` that says so.
 *
 * @param tokenFor - Finds the token of the project a Studio runs for
 * @returns The reads
 * @example
 * ```ts
 * const reads = projectReads((studio) => studioTokenFor(studio, view.targets));
 * await reads.fetchSites("http://localhost:6280", "shop", "orders.place");
 * ```
 */
export function projectReads(
  tokenFor: (studio: string) => Promise<string | undefined>,
): ProjectReads {
  return {
    fetchSites: async (studio, source, endpoint) =>
      fetchSites(studio, source, endpoint, await tokenFor(studio)),
    fetchDefinitions: async (studio) => fetchDefinitions(studio, await tokenFor(studio)),
    fetchGroups: async (studio) => fetchGroups(studio, await tokenFor(studio)),
  };
}

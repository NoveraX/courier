import { join } from "node:path";

import { findStudio } from "../studio/find-studio";
import type { EndpointStats } from "../studio/studio-types";
import type { CourierProject } from "./courier-projects";

/** A Studio the Courier view shows: a project's own, or the one the settings name. */
export interface StudioTarget {
  /** The project, or none for the Studio the settings name */
  readonly project?: CourierProject | undefined;
  /** Studio's address, while it answers */
  readonly studio?: string | undefined;
}

/** What finding the targets reads: the projects, the settings' Studio, and what Studio told the hints. */
export interface TargetSources {
  projects(): Promise<readonly CourierProject[]>;
  /** The Studio the settings name, when it is on this machine */
  configured(): string | undefined;
  /** Every endpoint's stats as a Studio told them last, `undefined` for one not asked or not answering */
  statsFor(studio: string): readonly EndpointStats[] | undefined;
  /** Ask a Studio, and whether it answers */
  answers(studio: string): Promise<boolean>;
}

/**
 * The Studios the Courier view shows: the one the settings name, else each
 * project's own — the address in its `.courier/studio.json`, kept only while
 * that Studio answers. A Studio the hints already asked is not asked again.
 *
 * @param sources - What the targets are found from
 * @returns One target per project, or the settings' Studio alone
 * @example
 * ```ts
 * await studioTargets(sources); // [{ project: shop, studio: "http://localhost:6280" }]
 * ```
 */
export async function studioTargets(sources: TargetSources): Promise<StudioTarget[]> {
  const configured = sources.configured();
  if (configured)
    return [{ studio: (await answering(sources, configured)) ? configured : undefined }];
  const projects = await sources.projects();
  return Promise.all(
    projects.map(async (project) => {
      /* The project's own file only: a Studio found above it runs for another project. */
      const address = await findStudio(join(project.root, "courier.config"), project.root);
      const studio = address && (await answering(sources, address)) ? address : undefined;
      return { project, studio };
    }),
  );
}

async function answering(sources: TargetSources, studio: string): Promise<boolean> {
  return sources.statsFor(studio) !== undefined || sources.answers(studio);
}

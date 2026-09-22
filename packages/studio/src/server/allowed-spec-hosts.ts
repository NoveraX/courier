/**
 * Private hosts the project allows Studio to fetch a specification from.
 *
 * Read from `studio.allowedSpecHosts` in `courier.config.ts` at the moment it
 * is needed, so editing the config takes effect without restarting Studio. A
 * project with no config, or one that names nothing, allows nothing beyond
 * this machine.
 */

import { getProjectRoot } from "../context";
import { loadCourierConfig } from "./config-loader";

/**
 * Read the allowlist the project declares.
 *
 * @returns Host entries as written, or an empty list when there are none
 */
export async function allowedSpecHosts(): Promise<readonly string[]> {
  try {
    const { config } = await loadCourierConfig(getProjectRoot());
    const hosts = config.studio?.allowedSpecHosts;
    return Array.isArray(hosts) ? hosts.filter((host) => typeof host === "string") : [];
  } catch {
    /* A project without a readable config simply allows nothing extra —
       the caller is about to report its own failure anyway. */
    return [];
  }
}

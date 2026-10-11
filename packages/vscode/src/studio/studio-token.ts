import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { StudioTarget } from "../projects/studio-targets";

/* 32 random bytes, base64url, as Studio makes them: anything else in the file is no token. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * The token of the project a Studio runs for, from its `.courier` folder —
 * which lets Studio's page, shown in the editor's tab, change things as the
 * link Studio prints does. A Studio the settings name, for a project
 * outside the workspace, has none here: its page there only looks.
 *
 * @param studio - Studio's address
 * @param targets - The Studios that run for the workspace's projects
 * @returns The token, or `undefined`
 * @example
 * ```ts
 * await studioTokenFor("http://localhost:6280", view.targets);
 * ```
 */
export async function studioTokenFor(
  studio: string,
  targets: () => Promise<readonly StudioTarget[]>,
): Promise<string | undefined> {
  const project = (await targets()).find((target) => target.studio === studio)?.project;
  if (!project) return undefined;
  try {
    const token = (await readFile(join(project.root, ".courier", "studio-token"), "utf8")).trim();
    return TOKEN.test(token) ? token : undefined;
  } catch {
    /* Studio writes the token as it starts; none yet is a page that only looks. */
    return undefined;
  }
}

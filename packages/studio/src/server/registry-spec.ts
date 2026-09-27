/**
 * Spec fetching and single-import update checking helpers.
 */

import { createLogger } from "@noverax/courier";
import type { CourierImportEntry } from "@noverax/courier/config";
import { computeSpecHash, parseSpec } from "../apis";
import type { ImportStateEntry } from "../apis/imports-state";
import { fetchSpec } from "./fetch-spec";
import { isUrl } from "./fs-helpers";
import type { ProjectRoot } from "./project-fs/project-root";
import { readProjectText } from "./project-fs/read-project-text";
import { sendRouteFailure } from "./route-failure";
import type { JsonResponse } from "./route-types";
import { SpecFetchError } from "./spec-fetch-error";
import type { SpecHostAllowlist } from "./spec-host-allowlist";
import { SpecHostsUnavailableError } from "./spec-hosts-unavailable-error";

const log = createLogger("Studio");

/**
 * Read an import's specification from its URL or its file, or answer the
 * route with why not: 400 for a URL Studio refuses or a file that is not
 * there, the refusal's own status while Studio cannot read which private
 * hosts the project allows, and 502 for a host that could not be read.
 *
 * @param specUrl - Where the import's specification lives
 * @param res - The route's response, answered when there is no text
 * @param allowlist - The private hosts the project names, read only for a private host
 * @param root - The project a spec file is read from
 * @returns The specification's text, or `null` once the route is answered
 *
 * @example
 * ```ts
 * const raw = await fetchSpecRaw(entry.from, res, specHostAllowlist(project, root), projectRootAt(root));
 * if (raw === null) return;
 * ```
 */
export async function fetchSpecRaw(
  specUrl: string,
  res: JsonResponse,
  allowlist: SpecHostAllowlist,
  root: ProjectRoot,
): Promise<string | null> {
  if (isUrl(specUrl)) {
    try {
      return await fetchSpec(specUrl, allowlist);
    } catch (err) {
      log.warn(`Studio could not fetch the spec from ${specUrl}`, err);
      if (err instanceof SpecHostsUnavailableError) {
        sendRouteFailure(res, err, `Failed to fetch spec from ${specUrl}`);
        return null;
      }
      const refused = err instanceof SpecFetchError && err.refused;
      const reason = err instanceof Error ? err.message : String(err);
      res
        .status(refused ? 400 : 502)
        .json({ error: `Failed to fetch spec from ${specUrl}: ${reason}` });
      return null;
    }
  }

  try {
    return readProjectText(root, specUrl);
  } catch (err) {
    sendRouteFailure(res, err, `Failed to read the spec file ${specUrl}`);
    return null;
  }
}

/**
 * Check whether an import's upstream specification changed since it was
 * written. Every failure is the import's own result, so one import that
 * cannot be read does not fail a check of all of them.
 *
 * @param entry - The import's declaration
 * @param state - What Studio recorded when it wrote the import
 * @param allowlist - The private hosts the project names, shared by every import of the check
 * @returns Whether it changed, or why it could not be checked
 *
 * @example
 * ```ts
 * const result = await checkSingleSource(entry, getImportState(imports, name), allowlist);
 * ```
 */
export async function checkSingleSource(
  entry: CourierImportEntry,
  state: ImportStateEntry | undefined,
  allowlist: SpecHostAllowlist,
): Promise<{ changed: boolean; error?: string }> {
  if (entry.importType !== "url") return { changed: false };
  const specUrl = entry.from;
  if (!specUrl) return { changed: false };

  try {
    const raw = await fetchSpec(specUrl, allowlist);
    const newSpec = parseSpec(raw);
    return { changed: computeSpecHash(newSpec) !== state?.specHash };
  } catch (err) {
    return { changed: false, error: err instanceof Error ? err.message : "Check failed" };
  }
}

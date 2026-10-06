/**
 * Spec fetching and single-import update checking helpers.
 */

import { createLogger } from "@noverax/courier";
import type { CourierImportEntry } from "@noverax/courier/config";
import { computeSpecHash } from "../apis";
import type { ImportStateEntry } from "../apis/imports-state";
import { authHeaders } from "./auth-headers";
import { fetchSpec } from "./fetch-spec";
import { isUrl } from "./fs-helpers";
import { messageOf } from "./message-of";
import { parseFetchedSpec } from "./parse-fetched-spec";
import type { ProjectRoot } from "./project-fs/project-root";
import { readProjectText } from "./project-fs/read-project-text";
import { sendRouteFailure } from "./route-failure";
import type { JsonResponse } from "./route-types";
import { checkPinnedHash } from "./spec-as-declared";
import { SpecFetchError } from "./spec-fetch-error";
import type { SpecHostAllowlist } from "./spec-host-allowlist";
import { SpecHostsUnavailableError } from "./spec-hosts-unavailable-error";

const log = createLogger("Studio");

/** What checking one import for updates found. */
export interface UpdateCheck {
  changed: boolean;
  /** The hash of the specification read, when it was. */
  latestHash?: string;
  /** Why the check failed, when it did. */
  error?: string;
  /** Why the import cannot be checked at all: it has no URL to fetch. */
  unchecked?: string;
}

/* A file or pasted import is compared only with a specification the user gives Manage. */
const UNCHECKABLE = {
  file: "A file import has no URL to check; upload its specification in Manage to compare.",
  raw: "A pasted import has no URL to check; paste its specification in Manage to compare.",
} as const;

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
 * @param headers - Headers to fetch a URL with, such as the import's auth
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
  headers: Readonly<Record<string, string>> = {},
): Promise<string | null> {
  if (isUrl(specUrl)) {
    try {
      return await fetchSpec(specUrl, allowlist, headers);
    } catch (err) {
      log.warn(`Studio could not fetch the spec from ${specUrl}`, err);
      if (err instanceof SpecHostsUnavailableError) {
        sendRouteFailure(res, err, `Failed to fetch spec from ${specUrl}`);
        return null;
      }
      const refused = err instanceof SpecFetchError && err.refused;
      const reason = messageOf(err);
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
 * written, fetching it with the import's auth. Every failure is the
 * import's own result, so one import that cannot be read does not fail a
 * check of all of them; a specification other than the one pinned is one.
 *
 * @param name - The import's key under `imports`
 * @param entry - The import's declaration
 * @param state - What Studio recorded when it wrote the import
 * @param allowlist - The private hosts the project names, shared by every import of the check
 * @returns Whether it changed, or why it could not be checked: an `error`
 *   when the check failed, `unchecked` for an import with no URL to fetch
 *
 * @example
 * ```ts
 * const result = await checkSingleSource(name, entry, getImportState(imports, name), allowlist);
 * ```
 */
export async function checkSingleSource(
  name: string,
  entry: CourierImportEntry,
  state: ImportStateEntry | undefined,
  allowlist: SpecHostAllowlist,
): Promise<UpdateCheck> {
  if (entry.importType !== "url")
    return { changed: false, unchecked: UNCHECKABLE[entry.importType] };
  const specUrl = entry.from;

  try {
    const raw = await fetchSpec(specUrl, allowlist, authHeaders(entry.auth));
    const newSpec = parseFetchedSpec(specUrl, raw);
    checkPinnedHash(name, entry, newSpec);
    const latestHash = computeSpecHash(newSpec);
    return { changed: latestHash !== state?.specHash, latestHash };
  } catch (err) {
    return { changed: false, error: err instanceof Error ? err.message : "Check failed" };
  }
}

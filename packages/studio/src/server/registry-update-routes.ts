/**
 * Express routes for imports update checks (single source and batch).
 *
 * Wired alongside `registry-routes.ts` so the manage UI can poll upstream
 * specs for changes without leaving the imports view.
 */

import { computeSpecHash, hasSpecChanged } from "../apis";
import type { ApisRouteDeps } from "./apis-routes";
import { authHeaders } from "./auth-headers";
import { getImportEntry, getImportState, importsSnapshotOf } from "./imports-bridge";
import { parseFetchedSpec } from "./parse-fetched-spec";
import { projectRootAt } from "./project-fs/project-root";
import { readDeclarations } from "./project-state/read-declarations";
import { refuseUnsendable } from "./refuse-unsendable";
import { checkSingleSource, fetchSpecRaw } from "./registry-spec";
import { sendRouteFailure } from "./route-failure";
import type { JsonResponse, RouteApp } from "./route-types";
import { checkPinnedHash } from "./spec-as-declared";
import { specHostAllowlist } from "./spec-host-allowlist";
import { validateNameBody } from "./validate-body-registry";

type RouteRequest = { body: unknown };

/**
 * Mount the routes that check an import's upstream spec for changes: one
 * import, or every import the config Studio runs declares.
 *
 * @param app - The Studio server's Express app
 * @param deps - The project the routes answer from
 *
 * @example
 * ```ts
 * registerUpdateRoutes(app, { project, projectRoot: root });
 * ```
 */
export function registerUpdateRoutes(app: RouteApp, deps: ApisRouteDeps): void {
  app.post("/api/apis/imports/check-updates", (req, res) => handleCheckUpdates(req, res, deps));
  app.post("/api/apis/imports/check-all", (_req, res) => handleCheckAll(res, deps));
}

async function handleCheckUpdates(
  req: RouteRequest,
  res: JsonResponse,
  { project, projectRoot }: ApisRouteDeps,
): Promise<void> {
  try {
    const body = validateNameBody(req.body, res);
    if (!body) return;

    const declarations = await readDeclarations(project, projectRoot, "show");
    const imports = importsSnapshotOf(declarations, projectRoot);
    const entry = getImportEntry(imports, body.name);
    if (!entry) {
      res.status(404).json({ error: `Import "${body.name}" not found in config` });
      return;
    }

    if (entry.importType !== "url") {
      res.status(400).json({ error: "Auto-check is only available for URL imports" });
      return;
    }

    const raw = await fetchSpecRaw(
      entry.from,
      res,
      specHostAllowlist(project, projectRoot),
      projectRootAt(projectRoot),
      authHeaders(entry.auth),
    );
    /* An empty body is text too: it fails as a specification below, and the route answers. */
    if (raw === null) return;

    const newSpec = parseFetchedSpec(entry.from, raw);
    checkPinnedHash(body.name, entry, newSpec);
    const newHash = computeSpecHash(newSpec);
    const changed = hasSpecChanged(imports.state, body.name, newHash);
    if (changed) refuseUnsendable(newSpec);
    res.json(changed ? { changed: true, newSpec } : { changed: false });
  } catch (err) {
    sendRouteFailure(res, err, "Failed to check updates");
  }
}

async function handleCheckAll(
  res: JsonResponse,
  { project, projectRoot }: ApisRouteDeps,
): Promise<void> {
  try {
    const declarations = await readDeclarations(project, projectRoot, "show");
    const imports = importsSnapshotOf(declarations, projectRoot);
    /* One read of the private hosts the project allows, for every import checked. */
    const allowlist = specHostAllowlist(project, projectRoot);
    const checks = await Promise.all(
      Object.entries(imports.declarations).map(
        async ([name, entry]) =>
          [
            name,
            await checkSingleSource(name, entry, getImportState(imports, name), allowlist),
          ] as const,
      ),
    );

    /* Own properties, so an import named `__proto__` is reported like any other. */
    res.json({ results: Object.fromEntries(checks) });
  } catch (err) {
    sendRouteFailure(res, err, "Failed to check sources");
  }
}

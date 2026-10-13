/**
 * Express routes for imports update checks (single source and batch).
 *
 * Wired alongside `registry-routes.ts` so the manage UI can poll upstream
 * specs for changes without leaving the imports view.
 */

import type { CourierUrlImport } from "@noverax/courier/config";
import { hasSpecChanged, type ImportsState } from "../apis";
import type { ApisRouteApp, ApisRouteDeps } from "./apis-routes";
import { authHeaders } from "./auth-headers";
import { checkPinnedSpecHash } from "./check-pinned-spec-hash";
import { checkedResponse } from "./checked-response";
import { getImportEntry, getImportState, importsSnapshotOf } from "./imports-bridge";
import { projectRootAt } from "./project-fs/project-root";
import { readDeclarations } from "./project-state/read-declarations";
import { readFetchedSpec } from "./read-fetched-spec";
import { checkSingleSource, fetchSpecRaw, type UpdateCheck } from "./registry-spec";
import { requestWork, type WorkedResponse } from "./request-work";
import { sendRouteFailure } from "./route-failure";
import type { JsonResponse } from "./route-types";
import { specHostAllowlist } from "./spec-host-allowlist";
import { validateNameBody } from "./validate-body-registry";

type RouteRequest = { body: unknown };
type CheckResponse = JsonResponse & WorkedResponse;

/** One URL import to check, as the config Studio runs declares it. */
interface CheckedImport {
  name: string;
  entry: CourierUrlImport;
  state: ImportsState;
}

/**
 * Mount the routes that check an import's upstream spec for changes: one
 * import, or every import the config Studio runs declares. A check stops —
 * its fetches, and its reads in processes, which leave their places — once
 * its caller has gone, and then records nothing: no check failed.
 *
 * @param app - The Studio server's Express app
 * @param deps - The project the routes answer from
 *
 * @example
 * ```ts
 * registerUpdateRoutes(app, { project, projectRoot: root });
 * ```
 */
export function registerUpdateRoutes(app: ApisRouteApp, deps: ApisRouteDeps): void {
  app.post("/api/apis/imports/check-updates", (req, res) => handleCheckUpdates(req, res, deps));
  app.post("/api/apis/imports/check-all", (_req, res) => handleCheckAll(res, deps));
}

async function handleCheckUpdates(
  req: RouteRequest,
  res: CheckResponse,
  deps: ApisRouteDeps,
): Promise<void> {
  /* Asked for before anything is awaited, so a caller that goes meanwhile is seen to. */
  const { signal } = requestWork(res);
  try {
    const body = validateNameBody(req.body, res);
    if (!body) return;

    const declarations = await readDeclarations(deps.project, deps.projectRoot, "show");
    const imports = importsSnapshotOf(declarations, deps.projectRoot);
    const entry = getImportEntry(imports, body.name);
    if (!entry) {
      res.status(404).json({ error: `Import "${body.name}" not found in config` });
      return;
    }

    if (entry.importType !== "url") {
      res.status(400).json({ error: "Auto-check is only available for URL imports" });
      return;
    }
    await checkOne({ name: body.name, entry, state: imports.state }, res, deps, signal);
  } catch (err) {
    sendRouteFailure(res, err, "Failed to check updates");
  }
}

/* Every answer is the check's outcome, which every page is told — unless
   the caller has gone, when nothing is answered and nothing recorded. */
async function checkOne(
  { name, entry, state }: CheckedImport,
  res: JsonResponse,
  { project, projectRoot }: ApisRouteDeps,
  signal: AbortSignal,
): Promise<void> {
  const remember = (found: { latestHash: string } | { error: string }) => {
    project.updateChecks.record(name, { from: entry.from, checkedAt: Date.now(), ...found });
    project.importsChanged();
  };
  const answer = checkedResponse(res, (error) => remember({ error }));
  try {
    const allowlist = specHostAllowlist(project, projectRoot);
    const raw = await fetchSpecRaw(entry.from, answer, allowlist, projectRootAt(projectRoot), {
      headers: authHeaders(entry.auth),
      signal,
    });
    /* An empty body is text too: it fails as a specification below, and the route answers. */
    if (raw === null) return;

    /* Read and hashed in a process: only a specification that changed is
       sent on, and refused when too large to send back. */
    const read = await readFetchedSpec(entry.from, raw, { signal });
    checkPinnedSpecHash(name, entry, read.hash);
    const changed = hasSpecChanged(state, name, read.hash);
    const newSpec = changed ? read.spec() : undefined;
    remember({ latestHash: read.hash });
    res.json(changed ? { changed, newSpec } : { changed });
  } catch (err) {
    if (!signal.aborted) sendRouteFailure(answer, err, "Failed to check updates");
  }
}

async function handleCheckAll(
  res: CheckResponse,
  { project, projectRoot }: ApisRouteDeps,
): Promise<void> {
  const { signal } = requestWork(res);
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
            await checkSingleSource(name, entry, getImportState(imports, name), allowlist, signal),
          ] as const,
      ),
    );
    /* A check its caller left stopped where it was: none of its outcomes is one. */
    if (signal.aborted) return;

    /* Every page is told each outcome, a page opened later too. */
    const checkedAt = Date.now();
    for (const [name, check] of checks) {
      const entry = getImportEntry(imports, name);
      if (entry?.importType !== "url") continue;
      const at = { from: entry.from, checkedAt };
      if (check.latestHash !== undefined) {
        project.updateChecks.record(name, { ...at, latestHash: check.latestHash });
      } else if (check.error !== undefined) {
        project.updateChecks.record(name, { ...at, error: check.error });
      }
    }
    project.importsChanged();
    /* Own properties, so an import named `__proto__` is reported like any other. */
    res.json({
      results: Object.fromEntries(checks.map(([name, check]) => [name, answerOf(check)])),
    });
  } catch (err) {
    sendRouteFailure(res, err, "Failed to check sources");
  }
}

/* What a page is told of a check: the hash read stays Studio's. */
function answerOf({ changed, error, unchecked }: UpdateCheck): Omit<UpdateCheck, "latestHash"> {
  return {
    changed,
    ...(error !== undefined && { error }),
    ...(unchecked !== undefined && { unchecked }),
  };
}

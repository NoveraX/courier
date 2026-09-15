/**
 * Express routes for imports update checks (single source and batch).
 *
 * Wired alongside `registry-routes.ts` so the manage UI can poll upstream
 * specs for changes without leaving the imports view.
 */

import { computeSpecHash, hasSpecChanged, parseSpec } from "../apis";
import { getImportEntry, loadImportsSnapshot } from "./imports-bridge";
import { checkSingleSource, errMsg, fetchSpecRaw } from "./registry-helpers";
import type { JsonResponse, RouteApp } from "./route-types";
import { validateNameBody } from "./validate-body-registry";

export function registerUpdateRoutes(app: RouteApp): void {
  app.post("/api/apis/imports/check-updates", handleCheckUpdates);
  app.post("/api/apis/imports/check-all", handleCheckAll);
}

async function handleCheckUpdates(
  req: { body: Record<string, unknown> },
  res: JsonResponse,
): Promise<void> {
  try {
    const body = validateNameBody(req.body, res);
    if (!body) return;

    const snapshot = await loadImportsSnapshot();
    const entry = getImportEntry(snapshot, body.name);
    if (!entry) {
      res.status(404).json({ error: `Import "${body.name}" not found in config` });
      return;
    }

    if (entry.importType !== "url") {
      res.status(400).json({ error: "Auto-check is only available for URL imports" });
      return;
    }

    const raw = await fetchSpecRaw(entry.from, res);
    if (!raw) return;

    const newSpec = parseSpec(raw);
    const newHash = computeSpecHash(newSpec);
    const changed = hasSpecChanged(snapshot.state, body.name, newHash);
    res.json(changed ? { changed: true, newSpec } : { changed: false });
  } catch (err) {
    res.status(500).json({ error: errMsg(err, "Failed to check updates") });
  }
}

async function handleCheckAll(
  _req: { body: Record<string, unknown> },
  res: JsonResponse,
): Promise<void> {
  try {
    const snapshot = await loadImportsSnapshot();
    const checks = await Promise.all(
      Object.entries(snapshot.declarations).map(
        async ([name, entry]) =>
          [name, await checkSingleSource(entry, snapshot.state.imports[name])] as const,
      ),
    );

    const results: Record<string, { changed: boolean; error?: string }> = {};
    for (const [name, result] of checks) results[name] = result;
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: errMsg(err, "Failed to check sources") });
  }
}

/**
 * Express routes for registry update checks (single source and batch).
 */

import { getSource, hasSpecChanged, loadRegistry, parseSpec } from "../apis";
import { checkSingleSource, errMsg, fetchSpecRaw } from "./registry-helpers";
import type { JsonResponse, RouteApp } from "./route-types";
import { validateNameBody } from "./validate-body-registry";

export function registerUpdateRoutes(app: RouteApp): void {
  app.post("/api/apis/registry/check-updates", handleCheckUpdates);
  app.post("/api/apis/registry/check-all", handleCheckAll);
}

async function handleCheckUpdates(
  req: { body: Record<string, unknown> },
  res: JsonResponse,
): Promise<void> {
  try {
    const body = validateNameBody(req.body, res);
    if (!body) return;

    const source = getSource(loadRegistry(body.configPath), body.name);
    if (!source) {
      res.status(404).json({ error: `Source "${body.name}" not found in registry` });
      return;
    }

    if (source.importType !== "url") {
      res.status(400).json({ error: "Auto-check is only available for URL imports" });
      return;
    }

    const raw = await fetchSpecRaw(source.specUrl, res);
    if (!raw) return;

    const newSpec = parseSpec(raw);
    res.json(hasSpecChanged(source, newSpec) ? { changed: true, newSpec } : { changed: false });
  } catch (err) {
    res.status(500).json({ error: errMsg(err, "Failed to check updates") });
  }
}

async function handleCheckAll(
  req: { body: Record<string, unknown> },
  res: JsonResponse,
): Promise<void> {
  try {
    const { configPath } = req.body as { configPath?: string };
    const config = loadRegistry(configPath);
    const checks = await Promise.all(
      Object.entries(config.sources).map(
        async ([name, source]) => [name, await checkSingleSource(source)] as const,
      ),
    );

    const results: Record<string, { changed: boolean; error?: string }> = {};
    for (const [name, result] of checks) results[name] = result;
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: errMsg(err, "Failed to check sources") });
  }
}

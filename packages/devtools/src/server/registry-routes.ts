/**
 * Express routes for the API registry (manage imported sources).
 */

import type { GenerateOptions, ParsedSpec } from "../apis";
import {
  addSource,
  getSource,
  hasSpecChanged,
  listSources,
  loadCache,
  loadDigestCache,
  loadRegistry,
  parseSpec,
  removeCachedDigest,
  removeCachedSource,
  removeSource,
  saveCache,
  saveDigestCache,
  saveRegistry,
} from "../apis";
import {
  checkSingleSource,
  collectFingerprints,
  errMsg,
  fetchSpecRaw,
  persistCaches,
} from "./registry-helpers";
import { withRegistryLock } from "./registry-lock";
import type { JsonResponse, RouteApp } from "./route-types";
import { validateNameBody, validateRegistryAddBody } from "./validate-body-registry";

export function registerRegistryRoutes(app: RouteApp): void {
  app.post("/api/apis/registry/list", (req, res) => {
    try {
      const { configPath } = req.body as { configPath?: string };
      const config = loadRegistry(configPath);
      res.json({ sources: listSources(config) });
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to list sources") });
    }
  });

  app.post("/api/apis/registry/add", (req, res) => {
    const body = validateRegistryAddBody(req.body, res);
    if (!body) return;

    void withRegistryLock(() => {
      const spec = body.spec as unknown as ParsedSpec;
      const options = body.options as unknown as GenerateOptions;
      const fingerprints = collectFingerprints(body.generatedFiles);
      const endpointCount = Object.keys(fingerprints).length;

      let config = loadRegistry(body.configPath);
      config = addSource(
        config,
        body.name,
        spec,
        body.specUrl,
        (body.importType ?? "url") as "url" | "file" | "raw",
        options,
        endpointCount,
      );
      saveRegistry(config, body.configPath);

      persistCaches(body.name, fingerprints, spec);
      res.json({ success: true, source: getSource(config, body.name) });
    }).catch((err) => {
      res.status(500).json({ error: errMsg(err, "Failed to add source") });
    });
  });

  app.post("/api/apis/registry/remove", (req, res) => {
    const body = validateNameBody(req.body, res);
    if (!body) return;

    void withRegistryLock(() => {
      const { name, configPath } = body;
      let config = loadRegistry(configPath);

      if (!getSource(config, name)) {
        res.status(404).json({ error: `Source "${name}" not found in registry` });
        return;
      }

      config = removeSource(config, name);
      saveRegistry(config, configPath);

      const cache = loadCache();
      saveCache(removeCachedSource(cache, name));

      const digestCache = loadDigestCache();
      saveDigestCache(removeCachedDigest(digestCache, name));

      res.json({ success: true });
    }).catch((err) => {
      res.status(500).json({ error: errMsg(err, "Failed to remove source") });
    });
  });

  registerUpdateRoutes(app);
}

function registerUpdateRoutes(app: RouteApp): void {
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

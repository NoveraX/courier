/**
 * Express routes for the API registry (manage imported sources).
 */

import type { GenerateOptions, ParsedSpec } from "../codegen";
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
} from "../codegen";
import {
  checkSingleSource,
  collectFingerprints,
  errMsg,
  fetchSpecRaw,
  persistCaches,
} from "./registry-helpers";
import { withRegistryLock } from "./registry-lock";
import type { RouteApp } from "./route-types";
import { validateNameBody, validateRegistryAddBody } from "./validate-body-registry";

export function registerRegistryRoutes(app: RouteApp): void {
  app.post("/api/codegen/registry/list", (req, res) => {
    try {
      const { configPath } = req.body as { configPath?: string };
      const config = loadRegistry(configPath);
      res.json({ sources: listSources(config) });
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to list sources") });
    }
  });

  app.post("/api/codegen/registry/add", (req, res) => {
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

  app.post("/api/codegen/registry/remove", (req, res) => {
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
  app.post("/api/codegen/registry/check-updates", async (req, res) => {
    try {
      const body = validateNameBody(req.body, res);
      if (!body) return;
      const { name, configPath } = body;
      const config = loadRegistry(configPath);
      const source = getSource(config, name);

      if (!source) {
        res.status(404).json({ error: `Source "${name}" not found in registry` });
        return;
      }

      const raw = await fetchSpecRaw(source.specUrl, res);
      if (!raw) return;

      const newSpec = parseSpec(raw);
      if (!hasSpecChanged(source, newSpec)) {
        res.json({ changed: false });
        return;
      }

      res.json({ changed: true, newSpec });
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to check updates") });
    }
  });

  app.post("/api/codegen/registry/check-all", async (req, res) => {
    try {
      const { configPath } = req.body as { configPath?: string };
      const config = loadRegistry(configPath);
      const entries = Object.entries(config.sources);
      const checks = await Promise.all(
        entries.map(async ([name, source]) => [name, await checkSingleSource(source)] as const),
      );

      const results: Record<string, { changed: boolean; error?: string }> = {};
      for (const [name, result] of checks) results[name] = result;

      res.json({ results });
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to check sources") });
    }
  });
}

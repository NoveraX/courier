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
import type { RouteApp } from "./route-types";

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
    try {
      const { name, spec, specUrl, importType, options, generatedFiles, configPath } = req.body as {
        name: string;
        spec: ParsedSpec;
        specUrl: string;
        importType?: "url" | "file" | "raw";
        options: GenerateOptions;
        generatedFiles: { path: string; content: string }[];
        configPath?: string;
      };

      const fingerprints = collectFingerprints(generatedFiles);
      const endpointCount = Object.keys(fingerprints).length;

      let config = loadRegistry(configPath);
      config = addSource(config, name, spec, specUrl, importType ?? "url", options, endpointCount);
      saveRegistry(config, configPath);

      /* Save fingerprints + digest to cache */
      persistCaches(name, fingerprints, spec);

      res.json({ success: true, source: getSource(config, name) });
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to add source") });
    }
  });

  app.post("/api/codegen/registry/remove", (req, res) => {
    try {
      const { name, configPath } = req.body as { name: string; configPath?: string };
      let config = loadRegistry(configPath);

      if (!getSource(config, name)) {
        res.status(404).json({ error: `Source "${name}" not found in registry` });
        return;
      }

      config = removeSource(config, name);
      saveRegistry(config, configPath);

      /* Clean up caches */
      const cache = loadCache();
      saveCache(removeCachedSource(cache, name));

      const digestCache = loadDigestCache();
      saveDigestCache(removeCachedDigest(digestCache, name));

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to remove source") });
    }
  });

  registerUpdateRoutes(app);
}

function registerUpdateRoutes(app: RouteApp): void {
  app.post("/api/codegen/registry/check-updates", async (req, res) => {
    try {
      const { name, configPath } = req.body as { name: string; configPath?: string };
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

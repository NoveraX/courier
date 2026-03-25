/**
 * Express routes for the API registry (manage imported sources).
 */

import type { GenerateOptions, ParsedSpec } from "../apis";
import {
  addSource,
  getSource,
  listSources,
  loadCache,
  loadDigestCache,
  loadRegistry,
  removeCachedDigest,
  removeCachedSource,
  removeSource,
  saveCache,
  saveDigestCache,
  saveRegistry,
} from "../apis";
import {
  collectFingerprints,
  errMsg,
  persistCaches,
  removeGeneratedFiles,
} from "./registry-helpers";
import { withRegistryLock } from "./registry-lock";
import { registerUpdateRoutes } from "./registry-update-routes";
import type { RouteApp } from "./route-types";
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

      let config = loadRegistry(body.configPath);
      config = addSource(
        config,
        body.name,
        spec,
        body.specUrl,
        (body.importType ?? "url") as "url" | "file" | "raw",
        options,
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

      const source = getSource(config, name);
      if (!source) {
        res.status(404).json({ error: `Source "${name}" not found in registry` });
        return;
      }

      removeGeneratedFiles(source.options.outputDir, name);

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

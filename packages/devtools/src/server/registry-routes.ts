/**
 * Express routes for the API registry (manage imported sources).
 */

import type { GenerateOptions, ParsedSpec, SpecSource } from "../codegen/index.js";
import {
  addSource,
  diffSpecs,
  getSource,
  hasSpecChanged,
  listSources,
  loadRegistry,
  parseSpec,
  removeSource,
  saveRegistry,
  updateFingerprints,
} from "../codegen/index.js";
import {
  checkSingleSource,
  collectFingerprints,
  errMsg,
  fetchSpecRaw,
} from "./registry-helpers.js";
import type { RouteApp } from "./route-types.js";

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
      const { name, spec, specSource, options, generatedFiles, configPath } = req.body as {
        name: string;
        spec: ParsedSpec;
        specSource: SpecSource;
        options: GenerateOptions;
        generatedFiles: { path: string; content: string }[];
        configPath?: string;
      };

      const fingerprints = collectFingerprints(generatedFiles);
      let config = loadRegistry(configPath);
      config = addSource(config, name, spec, specSource, options, fingerprints);
      saveRegistry(config, configPath);

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

      const raw = await fetchSpecRaw(source.specSource, res);
      if (!raw) return;

      const newSpec = parseSpec(raw);
      if (!hasSpecChanged(source, newSpec)) {
        res.json({ changed: false });
        return;
      }

      const diff = diffSpecs(source.cachedSpec ?? newSpec, newSpec);
      res.json({ changed: true, diff, newSpec });
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to check updates") });
    }
  });

  app.post("/api/codegen/registry/check-all", async (req, res) => {
    try {
      const { configPath } = req.body as { configPath?: string };
      const config = loadRegistry(configPath);
      const results: Record<string, { changed: boolean; error?: string }> = {};

      for (const [name, source] of Object.entries(config.sources)) {
        if (source.specSource.type !== "url") {
          results[name] = { changed: false };
          continue;
        }
        results[name] = await checkSingleSource(source);
      }

      res.json({ results });
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to check sources") });
    }
  });

  app.post("/api/codegen/registry/update-fingerprints", (req, res) => {
    try {
      const { name, generatedFiles, newSpec, configPath } = req.body as {
        name: string;
        generatedFiles: { path: string; content: string }[];
        newSpec: ParsedSpec;
        configPath?: string;
      };

      const fingerprints = collectFingerprints(generatedFiles);
      let config = loadRegistry(configPath);
      config = updateFingerprints(config, name, fingerprints, newSpec);
      saveRegistry(config, configPath);

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to update fingerprints") });
    }
  });
}

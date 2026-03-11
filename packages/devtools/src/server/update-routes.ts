/**
 * Express routes for update flow: preview and apply spec updates.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ParsedSpec } from "../codegen/index.js";
import {
  generateCode,
  getSource,
  loadRegistry,
  saveRegistry,
  updateFingerprints,
} from "../codegen/index.js";
import { previewUpdate } from "../codegen/merge/update-flow.js";
import { collectFingerprints, errMsg } from "./registry-helpers.js";
import type { RouteApp } from "./route-types.js";

export function registerUpdateFlowRoutes(app: RouteApp): void {
  app.post("/api/codegen/update/preview", (req, res) => {
    try {
      const { name, newSpec, configPath } = req.body as {
        name: string;
        newSpec: ParsedSpec;
        configPath?: string;
      };

      const config = loadRegistry(configPath);
      const source = getSource(config, name);
      if (!source) {
        res.status(404).json({ error: `Source "${name}" not found` });
        return;
      }

      const generated = generateCode(newSpec, source.options);
      const existingFiles = readGeneratedFiles(generated.map((g) => g.path));
      const result = previewUpdate(source, newSpec, generated, existingFiles);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to preview update") });
    }
  });

  app.post("/api/codegen/update/apply", (req, res) => {
    try {
      const { name, newSpec, files, configPath } = req.body as {
        name: string;
        newSpec: ParsedSpec;
        files: { path: string; content: string }[];
        configPath?: string;
      };

      let config = loadRegistry(configPath);
      const source = getSource(config, name);
      if (!source) {
        res.status(404).json({ error: `Source "${name}" not found` });
        return;
      }

      /* Write merged files to disk */
      for (const file of files) {
        writeFileSafe(resolve(file.path), file.content);
      }

      /* Regenerate to compute clean fingerprints */
      const generated = generateCode(newSpec, source.options);
      const fingerprints = collectFingerprints(generated);
      config = updateFingerprints(config, name, fingerprints, newSpec);
      saveRegistry(config, configPath);

      res.json({ success: true, written: files.length });
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to apply update") });
    }
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function readGeneratedFiles(paths: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const filePath of paths) {
    const absPath = resolve(filePath);
    if (existsSync(absPath)) {
      result[filePath] = readFileSync(absPath, "utf-8");
    }
  }
  return result;
}

function writeFileSafe(filePath: string, content: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, "utf-8");
}

/**
 * Express routes for codegen: parse, generate, write, diff, fingerprint.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  addSource,
  diffSpecs,
  type FingerprintResult,
  type GenerateOptions,
  generateCode,
  generateFingerprints,
  getSource,
  loadRegistry,
  mergeGroupFile,
  type ParsedSpec,
  parseSpec,
  saveRegistry,
} from "../codegen/index.js";
import type { SpecSource } from "../codegen/merge/types.js";
import { previewUpdate } from "../codegen/merge/update-flow.js";
import { cleanupOrphanFiles } from "./cleanup-orphans.js";
import { collectFingerprints } from "./registry-helpers.js";
import { registerRegistryRoutes } from "./registry-routes.js";
import type { RouteApp } from "./route-types.js";
import { registerUpdateFlowRoutes } from "./update-routes.js";

export function registerCodegenRoutes(app: RouteApp): void {
  app.post("/api/codegen/parse", async (req, res) => {
    try {
      const { source, content } = req.body as { source: "url" | "raw" | "file"; content: string };
      const raw = await resolveSpecContent(source, content);
      res.json(parseSpec(raw));
    } catch (err) {
      res.status(400).json({ error: errMsg(err, "Failed to parse spec") });
    }
  });

  app.post("/api/codegen/generate", (req, res) => {
    try {
      const { spec, options } = req.body as { spec: ParsedSpec; options: GenerateOptions };
      res.json({ files: generateCode(spec, options) });
    } catch (err) {
      res.status(400).json({ error: errMsg(err, "Code generation failed") });
    }
  });

  /**
   * Smart write: if source exists in registry, merges with existing files
   * to preserve user modifications. Otherwise writes directly.
   */
  app.post("/api/codegen/write", (req, res) => {
    try {
      const { files, sourceName, spec, specSource, options } = req.body as {
        files: { path: string; content: string }[];
        sourceName?: string;
        spec?: ParsedSpec;
        specSource?: SpecSource;
        options?: GenerateOptions;
      };

      const config = loadRegistry();
      const source = sourceName ? getSource(config, sourceName) : undefined;

      /* Source exists in registry → use merge to preserve user edits */
      if (source && sourceName && spec && specSource && options) {
        const existingFiles = readExistingFiles(files.map((f) => f.path));
        const preview = previewUpdate(source, spec, files, existingFiles);

        for (const file of preview.files) {
          writeFileSafe(resolve(file.path), file.content);
        }

        /* Clean up orphan files — scan effective dir (outputDir/sourceName) */
        const newPaths = new Set(files.map((f) => resolve(f.path)));
        const effectiveDir = `${source.outputDir.replace(/\/+$/, "")}/${options.sourceName}`;
        const deleted = cleanupOrphanFiles(effectiveDir, newPaths);

        /* Update registry with new fingerprints */
        const fingerprints = collectFingerprints(files);
        const updated = addSource(config, sourceName, spec, specSource, options, fingerprints);
        saveRegistry(updated);

        const mergedCount = preview.files.filter((f) => f.status === "merged").length;
        res.json({
          written: preview.files.length,
          merged: mergedCount,
          deleted,
          files: preview.files.map((f) => ({ path: f.path, status: f.status })),
        });
        return;
      }

      /* No registry entry → raw write */
      for (const file of files) {
        writeFileSafe(resolve(file.path), file.content);
      }

      /* Register in registry if spec info provided */
      if (sourceName && spec && specSource && options) {
        const fingerprints = collectFingerprints(files);
        const updated = addSource(config, sourceName, spec, specSource, options, fingerprints);
        saveRegistry(updated);
      }

      res.json({
        written: files.length,
        merged: 0,
        files: files.map((f) => ({ path: f.path, status: "safe" })),
      });
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to write files") });
    }
  });

  app.post("/api/codegen/diff", (req, res) => {
    try {
      const { oldSpec, newSpec } = req.body as { oldSpec: ParsedSpec; newSpec: ParsedSpec };
      res.json(diffSpecs(oldSpec, newSpec));
    } catch (err) {
      res.status(400).json({ error: errMsg(err, "Failed to diff specs") });
    }
  });

  app.post("/api/codegen/fingerprint", (req, res) => {
    try {
      const { files } = req.body as { files: { path: string; content: string }[] };
      const result: Record<string, Record<string, { hash: string; userModified: boolean }>> = {};
      for (const file of files) {
        result[file.path] = generateFingerprints(file.content);
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to compute fingerprints") });
    }
  });

  app.post("/api/codegen/merge", (req, res) => {
    try {
      const { existing, generated, fingerprints } = req.body as {
        existing: string;
        generated: string;
        fingerprints: FingerprintResult;
      };
      res.json(mergeGroupFile(existing, generated, fingerprints));
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to merge files") });
    }
  });

  registerRegistryRoutes(app);
  registerUpdateFlowRoutes(app);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

async function resolveSpecContent(
  source: "url" | "raw" | "file",
  content: string,
): Promise<string> {
  if (source === "url") {
    const response = await fetch(content);
    if (!response.ok) {
      throw new Error(`Failed to fetch spec: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }
  if (source === "file") {
    const filePath = resolve(content);
    if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    return readFileSync(filePath, "utf-8");
  }
  return content;
}

function readExistingFiles(paths: string[]): Record<string, string> {
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

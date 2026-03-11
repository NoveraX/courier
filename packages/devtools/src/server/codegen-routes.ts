/**
 * Express routes for codegen: parse, generate, write, config, diff, fingerprint.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  diffSpecs,
  type FingerprintResult,
  type GenerateOptions,
  generateCode,
  generateFingerprints,
  mergeGroupFile,
  type ParsedSpec,
  parseSpec,
} from "../codegen/index.js";
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

  app.post("/api/codegen/write", (req, res) => {
    try {
      const { files } = req.body as { files: { path: string; content: string }[] };
      for (const file of files) {
        writeFileSafe(resolve(file.path), file.content);
      }
      res.json({ written: files.length, files: files.map((f) => f.path) });
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to write files") });
    }
  });

  app.post("/api/codegen/save-config", (req, res) => {
    try {
      const { config, path: configPath } = req.body as { config: unknown; path?: string };
      const filePath = resolve(configPath ?? "codegen.nexus.json");
      writeFileSafe(filePath, `${JSON.stringify(config, null, 2)}\n`);
      res.json({ path: filePath });
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to save config") });
    }
  });

  app.post("/api/codegen/load-config", (req, res) => {
    try {
      const { path: configPath } = req.body as { path?: string };
      const filePath = resolve(configPath ?? "codegen.nexus.json");
      if (!existsSync(filePath)) {
        res.status(404).json({ error: "Config file not found" });
        return;
      }
      res.json(JSON.parse(readFileSync(filePath, "utf-8")));
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to load config") });
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

function writeFileSafe(filePath: string, content: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, "utf-8");
}

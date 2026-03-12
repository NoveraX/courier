/**
 * Express routes for codegen: parse, generate, write, diff, fingerprint.
 */

import { existsSync, readFileSync } from "node:fs";
import {
  diffSpecs,
  type FingerprintResult,
  type GenerateOptions,
  generateCode,
  generateFingerprints,
  mergeGroupFile,
  type ParsedSpec,
  parseSpec,
} from "../codegen";
import { resolveProjectSafe } from "../context";
import { errMsg } from "./registry-helpers";
import { registerRegistryRoutes } from "./registry-routes";
import type { RouteApp } from "./route-types";
import { registerScannerRoutes } from "./scanner-routes";
import { registerUpdateFlowRoutes } from "./update-routes";
import { validateSpecUrl } from "./validate-url";
import { registerWriteRoutes } from "./write-routes";

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

  registerWriteRoutes(app);

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
      const result: Record<string, Record<string, string>> = {};
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
  registerScannerRoutes(app);
  registerUpdateFlowRoutes(app);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function resolveSpecContent(
  source: "url" | "raw" | "file",
  content: string,
): Promise<string> {
  if (source === "url") {
    await validateSpecUrl(content);
    const response = await fetch(content);
    if (!response.ok) {
      throw new Error(`Failed to fetch spec: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }
  if (source === "file") {
    const filePath = resolveProjectSafe(content);
    if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    return readFileSync(filePath, "utf-8");
  }
  return content;
}

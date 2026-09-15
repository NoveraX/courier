/**
 * Express routes for apis: parse, generate, write, diff, fingerprint.
 */

import { existsSync, readFileSync } from "node:fs";
import { createFetch } from "@noverax/courier/fetch";
import {
  diffSpecs,
  type FingerprintResult,
  type GenerateOptions,
  generateCode,
  generateFingerprints,
  mergeGroupFile,
  type ParsedSpec,
  parseSpec,
} from "../apis";
import { resolveProjectSafe } from "../context";
import { registerManageRoutes } from "./manage-routes";
import { errMsg } from "./registry-helpers";
import { registerRegistryRoutes } from "./registry-routes";
import type { RouteApp } from "./route-types";
import { registerUpdateFlowRoutes } from "./update-routes";
import {
  validateDiffBody,
  validateFingerprintBody,
  validateGenerateBody,
  validateMergeBody,
  validateParseBody,
} from "./validate-body";
import { validateSpecUrl } from "./validate-url";
import { registerWriteRoutes } from "./write-routes";

const specClient = createFetch();

export function registerApisRoutes(app: RouteApp): void {
  app.post("/api/apis/parse", async (req, res) => {
    try {
      const body = validateParseBody(req.body, res);
      if (!body) return;
      const raw = await resolveSpecContent(body.source, body.content);
      res.json(parseSpec(raw));
    } catch (err) {
      res.status(400).json({ error: errMsg(err, "Failed to parse spec") });
    }
  });

  app.post("/api/apis/generate", (req, res) => {
    try {
      const body = validateGenerateBody(req.body, res);
      if (!body) return;
      res.json({
        files: generateCode(
          body.spec as unknown as ParsedSpec,
          body.options as unknown as GenerateOptions,
        ),
      });
    } catch (err) {
      res.status(400).json({ error: errMsg(err, "Code generation failed") });
    }
  });

  registerWriteRoutes(app);

  app.post("/api/apis/diff", (req, res) => {
    try {
      const body = validateDiffBody(req.body, res);
      if (!body) return;
      res.json(
        diffSpecs(body.oldSpec as unknown as ParsedSpec, body.newSpec as unknown as ParsedSpec),
      );
    } catch (err) {
      res.status(400).json({ error: errMsg(err, "Failed to diff specs") });
    }
  });

  app.post("/api/apis/fingerprint", (req, res) => {
    try {
      const body = validateFingerprintBody(req.body, res);
      if (!body) return;
      const result: Record<string, Record<string, string>> = {};
      for (const file of body.files) {
        result[file.path] = generateFingerprints(file.content);
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to compute fingerprints") });
    }
  });

  app.post("/api/apis/merge", (req, res) => {
    try {
      const body = validateMergeBody(req.body, res);
      if (!body) return;
      res.json(
        mergeGroupFile(
          body.existing,
          body.generated,
          body.fingerprints as unknown as FingerprintResult,
        ),
      );
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to merge files") });
    }
  });

  registerRegistryRoutes(app);
  registerManageRoutes(app);
  registerUpdateFlowRoutes(app);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function resolveSpecContent(
  source: "url" | "raw" | "file",
  content: string,
): Promise<string> {
  if (source === "url") {
    await validateSpecUrl(content);
    return specClient.get<string>(content, { responseType: "text" });
  }
  if (source === "file") {
    const filePath = resolveProjectSafe(content);
    if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    return readFileSync(filePath, "utf-8");
  }
  return content;
}

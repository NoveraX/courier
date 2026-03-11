/**
 * Express routes for the codegen API.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  type GenerateOptions,
  generateCode,
  type ParsedSpec,
  parseSpec,
} from "../codegen/index.js";

interface JsonResponse {
  status(code: number): JsonResponse;
  json(data: unknown): void;
}

interface RouteApp {
  post(
    path: string,
    handler: (req: { body: Record<string, unknown> }, res: JsonResponse) => void | Promise<void>,
  ): void;
}

export function registerCodegenRoutes(app: RouteApp): void {
  // Parse spec (URL, raw content, or file path)
  app.post("/api/codegen/parse", async (req, res) => {
    try {
      const { source, content } = req.body as { source: "url" | "raw" | "file"; content: string };
      let raw: string;

      if (source === "url") {
        const response = await fetch(content);
        if (!response.ok) {
          res
            .status(400)
            .json({ error: `Failed to fetch spec: ${response.status} ${response.statusText}` });
          return;
        }
        raw = await response.text();
      } else if (source === "file") {
        const filePath = resolve(content);
        if (!existsSync(filePath)) {
          res.status(400).json({ error: `File not found: ${filePath}` });
          return;
        }
        raw = readFileSync(filePath, "utf-8");
      } else {
        raw = content;
      }

      const spec = parseSpec(raw);
      res.json(spec);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to parse spec" });
    }
  });

  // Generate code from parsed spec + options
  app.post("/api/codegen/generate", (req, res) => {
    try {
      const { spec, options } = req.body as { spec: ParsedSpec; options: GenerateOptions };
      const files = generateCode(spec, options);
      res.json({ files });
    } catch (err) {
      res
        .status(400)
        .json({ error: err instanceof Error ? err.message : "Code generation failed" });
    }
  });

  // Write generated files to disk
  app.post("/api/codegen/write", (req, res) => {
    try {
      const { files } = req.body as { files: { path: string; content: string }[] };
      let written = 0;

      for (const file of files) {
        const filePath = resolve(file.path);
        const dir = dirname(filePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(filePath, file.content, "utf-8");
        written++;
      }

      res.json({ written, files: files.map((f) => f.path) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to write files" });
    }
  });

  // Save codegen config as codegen.nexus.json
  app.post("/api/codegen/save-config", (req, res) => {
    try {
      const { config, path: configPath } = req.body as { config: unknown; path?: string };
      const filePath = resolve(configPath ?? "codegen.nexus.json");
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
      res.json({ path: filePath });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to save config" });
    }
  });

  // Load codegen config
  app.post("/api/codegen/load-config", (req, res) => {
    try {
      const { path: configPath } = req.body as { path?: string };
      const filePath = resolve(configPath ?? "codegen.nexus.json");

      if (!existsSync(filePath)) {
        res.status(404).json({ error: "Config file not found" });
        return;
      }
      const content = readFileSync(filePath, "utf-8");
      res.json(JSON.parse(content));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load config" });
    }
  });
}

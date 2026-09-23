import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { RequestHandler } from "express-serve-static-core";

/**
 * Serve the built Studio UI, when the package ships one: hashed assets
 * cached for good, everything else as the single-page app.
 *
 * @param app - The Studio server's Express app
 */
export function serveStudioUi(app: ReturnType<typeof express>): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const uiDistPath = join(here, "..", "ui", "dist");
  if (!existsSync(uiDistPath)) return;

  // Hashed assets — immutable cache (hash in filename = safe to cache forever)
  const serveAssets = express.static(join(uiDistPath, "assets")) as RequestHandler;
  const setCacheHeaders: RequestHandler = (req, res, next) => {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return serveAssets(req, res, next);
  };
  app.use("/assets", setCacheHeaders);
  app.use(express.static(uiDistPath));
  // SPA fallback — Express 5 requires named param for catch-all
  app.get("/{*splat}", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(join(uiDistPath, "index.html"));
  });
}

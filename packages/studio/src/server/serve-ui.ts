import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { RequestHandler } from "express-serve-static-core";

/** Where the built UI sits beside the server that ships it. */
function shippedUiDist(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "ui", "dist");
}

/**
 * Serve the built Studio UI, when the package ships one: hashed assets
 * cached for good, everything else as the single-page app.
 *
 * Every file is looked up relative to the UI's own folder. A package manager
 * may install Studio under a folder whose name starts with a dot — pnpm's
 * `node_modules/.pnpm`, npx's `~/.npm/_npx` — and a file sent by its
 * absolute path is refused for that dot, which made every page but the
 * first answer 404 on a reload.
 *
 * @param app - The Studio server's Express app
 * @param uiDistPath - The built UI's folder; the one shipped beside the server by default
 *
 * @example
 * ```ts
 * serveStudioUi(app);
 * ```
 */
export function serveStudioUi(
  app: ReturnType<typeof express>,
  uiDistPath: string = shippedUiDist(),
): void {
  if (!existsSync(uiDistPath)) return;

  // Hashed assets — immutable cache (hash in filename = safe to cache forever)
  const serveAssets = express.static(join(uiDistPath, "assets")) as RequestHandler;
  const setCacheHeaders: RequestHandler = (req, res, next) => {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return serveAssets(req, res, next);
  };
  /* An asset a stale page asks for is gone: the app in its place fails as a script of the wrong type. */
  const assetMissing: RequestHandler = (_req, res) => {
    res.removeHeader("Cache-Control");
    res.status(404).type("text/plain").send("This asset is not in the Studio build.");
  };
  app.use("/assets", setCacheHeaders);
  app.use("/assets", assetMissing);
  app.use(express.static(uiDistPath));
  // SPA fallback — Express 5 requires named param for catch-all
  app.get("/{*splat}", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile("index.html", { root: uiDistPath });
  });
}

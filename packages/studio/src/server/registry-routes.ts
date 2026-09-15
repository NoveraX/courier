/**
 * Express routes for the imports surface — list and remove. The write path
 * lives in `write-routes.ts` and shares the imports-state persistence via
 * `imports-bridge.ts`.
 */

import { logger } from "@noverax/nexus";
import {
  dropImportState,
  formatImportSnippet,
  loadImportsSnapshot,
  summarizeImports,
} from "./imports-bridge";
import { withImportsLock } from "./imports-lock";
import { errMsg, removeGeneratedFiles } from "./registry-helpers";
import { registerUpdateRoutes } from "./registry-update-routes";
import type { RouteApp } from "./route-types";
import { validateNameBody } from "./validate-body-registry";

export function registerRegistryRoutes(app: RouteApp): void {
  app.post("/api/apis/imports/list", async (_req, res) => {
    try {
      const snapshot = await loadImportsSnapshot();
      res.json({ sources: summarizeImports(snapshot) });
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to list imports") });
    }
  });

  app.post("/api/apis/imports/remove", (req, res) => {
    const body = validateNameBody(req.body, res);
    if (!body) return;

    void withImportsLock(async () => {
      const snapshot = await loadImportsSnapshot();
      const entry = snapshot.declarations[body.name];
      const state = snapshot.state.imports[body.name];
      if (!entry && !state) {
        res.status(404).json({ error: `Import "${body.name}" not found` });
        return;
      }

      const removedFiles = state?.generatedFiles ?? [];
      try {
        if (removedFiles.length > 0) removeGeneratedFiles(removedFiles);
      } catch (err) {
        logger.warn(
          "Studio",
          `Failed to delete some generated files for import "${body.name}"; state will be cleaned regardless: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      await dropImportState(body.name);

      const configCleanupHint = entry
        ? `Remove \`imports.${body.name}\` from nexus.config.ts to finalize the deletion.`
        : undefined;
      const snippet = entry ? formatImportSnippet(body.name, entry) : undefined;
      res.json({ success: true, removedFiles, configCleanupHint, snippet });
    }).catch((err) => {
      res.status(500).json({ error: errMsg(err, "Failed to remove import") });
    });
  });

  registerUpdateRoutes(app);
}

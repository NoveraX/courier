/**
 * Express routes for update flow: preview and apply spec updates.
 */

import { errMsg } from "./registry-helpers";
import { withRegistryLock } from "./registry-lock";
import type { RouteApp } from "./route-types";
import { handleApplyUpdate, handlePreviewUpdate } from "./update-helpers";
import { validateUpdateApplyBody, validateUpdatePreviewBody } from "./validate-body-registry";

export function registerUpdateFlowRoutes(app: RouteApp): void {
  app.post("/api/apis/update/preview", (req, res) => {
    try {
      const body = validateUpdatePreviewBody(req.body, res);
      if (!body) return;
      const result = handlePreviewUpdate(
        body as unknown as Parameters<typeof handlePreviewUpdate>[0],
      );
      if ("error" in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: errMsg(err, "Failed to preview update") });
    }
  });

  app.post("/api/apis/update/apply", (req, res) => {
    const body = validateUpdateApplyBody(req.body, res);
    if (!body) return;

    void withRegistryLock(() => {
      const result = handleApplyUpdate(body as unknown as Parameters<typeof handleApplyUpdate>[0]);
      if ("error" in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(result);
    }).catch((err) => {
      res.status(500).json({ error: errMsg(err, "Failed to apply update") });
    });
  });
}

/**
 * Express route for apis write — merges with existing files or writes raw.
 */

import { getImportEntry, getImportState, loadImportsSnapshot } from "./imports-bridge";
import { withImportsLock } from "./imports-lock";
import { errMsg } from "./registry-helpers";
import type { RouteApp } from "./route-types";
import { validateWriteBody } from "./validate-body";
import { handleMergeWrite, handleRawWrite } from "./write-helpers";
import type { WriteBody } from "./write-types";

export function registerWriteRoutes(app: RouteApp): void {
  app.post("/api/apis/write", (req, res) => {
    const validated = validateWriteBody(req.body, res);
    if (!validated) return;

    void withImportsLock(async () => {
      const { files, sourceName, spec, options } = validated as unknown as WriteBody;

      const snapshot = await loadImportsSnapshot();
      const entry = sourceName ? getImportEntry(snapshot, sourceName) : undefined;
      const state = sourceName ? getImportState(snapshot, sourceName) : undefined;

      if (entry && sourceName && spec && options) {
        const result = await handleMergeWrite(files, sourceName, spec, { entry, state });
        res.json(result);
        return;
      }

      const result = await handleRawWrite(files, sourceName, spec, { entry, state });
      res.json(result);
    }).catch((err) => {
      res.status(500).json({ error: errMsg(err, "Failed to write files") });
    });
  });
}

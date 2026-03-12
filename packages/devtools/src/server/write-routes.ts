/**
 * Express route for codegen write — merges with existing files or writes raw.
 */

import { getSource, loadRegistry } from "../codegen";
import { errMsg } from "./registry-helpers";
import { withRegistryLock } from "./registry-lock";
import type { RouteApp } from "./route-types";
import { validateWriteBody } from "./validate-body";
import { handleMergeWrite, handleRawWrite } from "./write-helpers";
import type { WriteBody } from "./write-types";

export function registerWriteRoutes(app: RouteApp): void {
  app.post("/api/codegen/write", (req, res) => {
    const validated = validateWriteBody(req.body, res);
    if (!validated) return;

    void withRegistryLock(() => {
      const { files, sourceName, spec, specUrl, importType, options } =
        validated as unknown as WriteBody;

      const config = loadRegistry();
      const source = sourceName ? getSource(config, sourceName) : undefined;

      if (source && sourceName && spec && options) {
        const result = handleMergeWrite(
          files,
          sourceName,
          spec,
          specUrl,
          importType,
          options,
          config,
          source,
        );
        res.json(result);
        return;
      }

      const result = handleRawWrite(files, sourceName, spec, specUrl, importType, options, config);
      res.json(result);
    }).catch((err) => {
      res.status(500).json({ error: errMsg(err, "Failed to write files") });
    });
  });
}

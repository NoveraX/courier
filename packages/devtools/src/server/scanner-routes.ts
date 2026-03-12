/**
 * Express routes for code scanner.
 */

import { scanProject } from "../codegen/scanner";
import type { ScanConfig } from "../codegen/scanner/types";
import { errMsg } from "./fs-helpers";
import type { RouteApp } from "./route-types";

export function registerScannerRoutes(app: RouteApp): void {
  app.post("/api/codegen/scan", (req, res) => {
    try {
      const config = req.body as Partial<ScanConfig> | undefined;
      const result = scanProject(config ?? {});
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: errMsg(err, "Scan failed"),
      });
    }
  });
}

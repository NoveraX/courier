import { InvalidImportError, resolveImportLayout } from "../apis/layout";
import { isRecord } from "./mocks-edit/is-record";
import { sendRouteFailure } from "./route-failure";
import type { RouteApp } from "./route-types";

interface LayoutBody {
  importName: string;
  outputDir: string;
  sourceName?: string;
}

/**
 * Mount the route that tells where an import's files would go, so the
 * import wizard shows the directory Studio will write rather than one it
 * works out on its own. It reads and writes nothing.
 *
 * `POST /api/apis/layout` with `{ importName, outputDir, sourceName? }`
 * answers `{ dir, sourceFile, sourceBinding }`, or 400 with `{ error, field }`
 * for a directory or name Studio refuses.
 *
 * @param app - The Studio server's Express app
 * @example
 * ```ts
 * registerLayoutRoute(app);
 * ```
 */
export function registerLayoutRoute(app: RouteApp): void {
  app.post("/api/apis/layout", (req, res) => {
    const body = readLayoutBody(req.body);
    if (body === null) {
      res.status(400).json({ error: "Expected { importName, outputDir, sourceName? } as strings" });
      return;
    }
    try {
      const layout = resolveImportLayout(body, body.importName);
      res.json({
        dir: layout.dir,
        sourceFile: layout.sourceFile,
        sourceBinding: layout.sourceBinding,
      });
    } catch (err) {
      if (err instanceof InvalidImportError) {
        res.status(400).json({ error: err.message, code: err.code, field: err.field });
        return;
      }
      sendRouteFailure(res, err, "Could not lay out the import");
    }
  });
}

function readLayoutBody(body: unknown): LayoutBody | null {
  if (!isRecord(body)) return null;
  const { importName, outputDir, sourceName } = body;
  if (typeof importName !== "string" || typeof outputDir !== "string") return null;
  if (sourceName !== undefined && typeof sourceName !== "string") return null;
  return { importName, outputDir, ...(sourceName !== undefined && { sourceName }) };
}

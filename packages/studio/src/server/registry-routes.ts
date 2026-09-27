/**
 * Express routes for the imports surface — list and remove. The write path
 * lives in `write-routes.ts` and shares the imports-state persistence via
 * `imports-bridge.ts`.
 */

import { logger } from "@noverax/courier";
import type { ApisRouteDeps } from "./apis-routes";
import { formatImportSnippet } from "./format-import-snippet";
import {
  dropImportState,
  getImportEntry,
  getImportState,
  importsSnapshotOf,
} from "./imports-bridge";
import { withImportsLock } from "./imports-lock";
import { readDeclarations } from "./project-state/read-declarations";
import { removeGeneratedFiles } from "./registry-helpers";
import { registerUpdateRoutes } from "./registry-update-routes";
import { sendRouteFailure } from "./route-failure";
import type { RouteApp } from "./route-types";
import { validateNameBody } from "./validate-body-registry";

interface Reply {
  status: number;
  body: unknown;
}

/**
 * Mount the imports list, removal and update-check routes. They answer from
 * the declarations of the config Studio runs; removing an import works while
 * that config does not load, since it only undoes what Studio wrote.
 *
 * @param app - The Studio server's Express app
 * @param deps - The project the routes answer from
 *
 * @example
 * ```ts
 * registerRegistryRoutes(app, { project, projectRoot: root });
 * ```
 */
export function registerRegistryRoutes(app: RouteApp, deps: ApisRouteDeps): void {
  app.post("/api/apis/imports/remove", async (req, res) => {
    const body = validateNameBody(req.body, res);
    if (!body) return;
    try {
      /* Read once the lock is held: a request that waited behind a write answers
         for the declaration saved meanwhile, and removes the files that write recorded. */
      const reply = await withImportsLock(() => forgetImport(body.name, deps));
      res.status(reply.status).json(reply.body);
    } catch (err) {
      sendRouteFailure(res, err, "Failed to remove import");
    }
  });

  registerUpdateRoutes(app, deps);
}

async function forgetImport(name: string, { project, projectRoot }: ApisRouteDeps): Promise<Reply> {
  const declarations = await readDeclarations(project, projectRoot, "forget");
  const imports = importsSnapshotOf(declarations, projectRoot);
  const entry = getImportEntry(imports, name);
  const state = getImportState(imports, name);
  if (!entry && !state) return { status: 404, body: { error: `Import "${name}" not found` } };

  const removedFiles = state?.generatedFiles ?? [];
  try {
    if (removedFiles.length > 0) removeGeneratedFiles(removedFiles);
  } catch (err) {
    logger.warn(
      "Studio",
      `Failed to delete some generated files for import "${name}"; state will be cleaned regardless`,
      err,
    );
  }

  await dropImportState(name);
  project.importsChanged();

  const configCleanupHint = entry
    ? `Remove \`imports.${name}\` from courier.config.ts to finalize the deletion.`
    : undefined;
  const snippet = entry ? formatImportSnippet(name, entry) : undefined;
  return { status: 200, body: { success: true, removedFiles, configCleanupHint, snippet } };
}

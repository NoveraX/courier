/**
 * Express route for apis write — merges with existing files or writes raw.
 */

import type { ApisRouteDeps } from "./apis-routes";
import { getImportEntry, getImportState, importsSnapshotOf } from "./imports-bridge";
import { withImportsLock } from "./imports-lock";
import { readDeclarations } from "./project-state/read-declarations";
import { sendRouteFailure } from "./route-failure";
import type { RouteApp } from "./route-types";
import { validateWriteBody } from "./validate-body";
import { handleMergeWrite, handleRawWrite } from "./write-helpers";
import type { WriteBody, WriteResult } from "./write-types";

/**
 * Mount the route that writes generated files into the project.
 *
 * Files named with no import are written as they are, at once, whatever
 * state courier.config is in: they record no import state, so they neither
 * read the config nor wait for a write to an import. Files for an import are merged with what is on disk
 * when the config Studio runs declares that import, and written raw when it
 * does not; either way only while that config loads as it is on disk, since
 * the declaration decides which directory is merged and cleaned up.
 *
 * @param app - The Studio server's Express app
 * @param deps - The project the route reads the import's declaration from
 *
 * @example
 * ```ts
 * registerWriteRoutes(app, { project, projectRoot: root });
 * ```
 */
export function registerWriteRoutes(app: RouteApp, deps: ApisRouteDeps): void {
  app.post("/api/apis/write", (req, res) => {
    const validated = validateWriteBody(req.body, res);
    if (!validated) return;
    const body = validated as unknown as WriteBody;

    void writeFiles(body, deps).then(
      (result) => res.json(result),
      (err: unknown) => sendRouteFailure(res, err, "Failed to write files"),
    );
  });
}

function writeFiles(body: WriteBody, deps: ApisRouteDeps): Promise<WriteResult> {
  const { files, sourceName, spec } = body;
  if (!sourceName) {
    return handleRawWrite(files, undefined, spec, { entry: undefined, state: undefined });
  }
  return withImportsLock(() => writeImport(body, sourceName, deps));
}

async function writeImport(
  { files, spec, options }: WriteBody,
  sourceName: string,
  { project, projectRoot }: ApisRouteDeps,
): Promise<WriteResult> {
  /* Read once the lock is held: a request that waited behind another write
     acts on the declaration saved meanwhile, not the one it arrived with. */
  const declarations = await readDeclarations(project, projectRoot, "act");
  const imports = importsSnapshotOf(declarations, projectRoot);
  const entry = getImportEntry(imports, sourceName);
  const state = getImportState(imports, sourceName);

  if (entry && spec && options) return handleMergeWrite(files, sourceName, spec, { entry, state });
  return handleRawWrite(files, sourceName, spec, { entry, state });
}

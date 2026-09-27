/**
 * Express route for apis write — merges with existing files or writes raw.
 */

import type { ApisRouteDeps } from "./apis-routes";
import { describeImportDeclaration } from "./describe-import-declaration";
import { getImportEntry, getImportState, importsSnapshotOf } from "./imports-bridge";
import { withImportsLock } from "./imports-lock";
import { readConfigToAct } from "./project-state/read-config-to-act";
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
 * Studio changes no config: a write for an import answers with what the
 * config must still declare for it — the generated source under `sources`,
 * without which Studio does not list the API, and the entry under `imports`
 * — and with nothing more once it declares both. While `sources` declares
 * another API under the import's name, it answers that the name is taken.
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
  return withImportsLock(async () => {
    const result = await writeImport(body, sourceName, deps);
    /* A write records the import's state only with the spec it was generated from. */
    if (spec) deps.project.importsChanged();
    return result;
  });
}

async function writeImport(
  body: WriteBody,
  sourceName: string,
  { project, projectRoot }: ApisRouteDeps,
): Promise<WriteResult> {
  /* Read once the lock is held: a request that waited behind another write
     acts on the declaration saved meanwhile, not the one it arrived with. */
  const loaded = await readConfigToAct(project, projectRoot);
  const imports = importsSnapshotOf(loaded.config.imports, projectRoot);
  const entry = getImportEntry(imports, sourceName);
  const state = getImportState(imports, sourceName);
  const { files, spec, options } = body;

  const result =
    entry && spec && options
      ? await handleMergeWrite(files, sourceName, spec, { entry, state })
      : await handleRawWrite(files, sourceName, spec, { entry, state });
  const declaration = describeImportDeclaration({
    name: sourceName,
    body,
    loaded,
    root: projectRoot,
  });
  return declaration ? { ...result, declaration } : result;
}

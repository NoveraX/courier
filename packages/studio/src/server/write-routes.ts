import { resolveImportLayout } from "../apis/layout";
import type { ApisRouteDeps } from "./apis-routes";
import { checkDeclaredDirectory } from "./check-declared-directory";
import { checkDirOverlap } from "./check-dir-overlap";
import { describeImportDeclaration } from "./describe-import-declaration";
import { getImportEntry, getImportState, importsSnapshotOf } from "./imports-bridge";
import { withImportsLock } from "./imports-lock";
import { projectRootAt } from "./project-fs/project-root";
import { readConfigToAct } from "./project-state/read-config-to-act";
import { applyRegeneration } from "./regenerate-import";
import { sendRouteFailure } from "./route-failure";
import type { RouteApp } from "./route-types";
import { declaredSpec } from "./spec-as-declared";
import { readWriteBody } from "./write-body";
import type { WriteBody, WriteResult } from "./write-types";

/**
 * Mount the route that writes an import's files into the project.
 *
 * Studio generates the files itself, from the spec and the options the
 * request names, into the directory the import's declaration gives it, or
 * the options when courier.config does not declare it yet; the request
 * names no path and carries no content. The files are planned by who owns
 * each one and applied all at once, only while the config loads as it is on
 * disk. A plan with steps only the user may allow is answered 409 with the
 * plan, and applied once the request quotes its digest with the steps
 * allowed.
 *
 * Studio changes no config: the answer says what the config must still
 * declare for the import — the generated source under `sources` and the
 * entry under `imports`. While `sources` declares another API under the
 * import's name, or another import owns a directory overlapping the
 * import's, nothing is written.
 *
 * @param app - The Studio server's Express app
 * @param deps - The project the route reads the import's declaration from
 * @example
 * ```ts
 * registerWriteRoutes(app, { project, projectRoot: root });
 * ```
 */
export function registerWriteRoutes(app: RouteApp, deps: ApisRouteDeps): void {
  app.post("/api/apis/write", (req, res) => {
    const body = readWriteBody(req.body);
    if (body === null) {
      res.status(400).json({
        error: "Expected { sourceName, spec, options } with the spec as Studio parsed it",
      });
      return;
    }
    void withImportsLock(() => writeImport(body, deps)).then(
      (result) => res.json(result),
      (err: unknown) => sendRouteFailure(res, err, "Failed to write the import"),
    );
  });
}

async function writeImport(
  body: WriteBody,
  { project, projectRoot }: ApisRouteDeps,
): Promise<WriteResult> {
  /* Read once the lock is held: a request that waited behind another write
     acts on the declaration saved meanwhile, not the one it arrived with. */
  const loaded = await readConfigToAct(project, projectRoot);
  const imports = importsSnapshotOf(loaded.config.imports, projectRoot);
  const name = body.sourceName;
  const entry = getImportEntry(imports, name);
  checkDeclaredDirectory(name, entry, body.options);
  const layout = resolveImportLayout(entry ?? body.options, name);
  checkDirOverlap(name, layout.dir, imports);
  const declaration = describeImportDeclaration({ name, body, loaded, root: projectRoot });
  const { report, leftBehind } = await applyRegeneration(
    {
      root: projectRootAt(projectRoot),
      name,
      layout,
      ...(await declaredSpec(entry, name, body.spec)),
      options: body.options,
      entry: getImportState(imports, name),
      origin: body.origin ?? "given",
    },
    body,
    "when-shown",
  );
  project.importsChanged();
  return {
    written: report.written,
    removed: report.removed,
    kept: report.kept,
    ...(report.backupDir !== undefined && { backupDir: report.backupDir }),
    pruneFailures: report.pruneFailures,
    leftBehind,
    ...(declaration && { declaration }),
  };
}

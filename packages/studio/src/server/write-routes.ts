import type { ApisRouteDeps } from "./apis-routes";
import { withImportsLock } from "./imports-lock";
import { sendRouteFailure } from "./route-failure";
import type { RouteApp } from "./route-types";
import { readWriteBody } from "./write-body";
import { writeImport } from "./write-import";

/**
 * Mount the route that writes an import's files into the project, as
 * {@link writeImport} does: the request names no path and carries no
 * content, a plan with steps only the user may allow is answered 409 with
 * the plan, and applied once the request quotes its digest with the steps
 * allowed. Studio changes no config: the answer says what the config must
 * still declare for the import.
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
    /* Read once the lock is held: a request that waited behind another write
       acts on the declaration saved meanwhile, not the one it arrived with. */
    void withImportsLock(() => writeImport(body, deps)).then(
      (result) => res.json(result),
      (err: unknown) => sendRouteFailure(res, err, "Failed to write the import"),
    );
  });
}

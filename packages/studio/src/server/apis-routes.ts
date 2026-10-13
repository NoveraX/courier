/**
 * Express routes for apis: generate, write, diff, and the imports list,
 * checks, management and updates. Reading a specification is
 * `parse-route.ts`.
 */

import { diffSpecs, generateCode } from "../apis";
import { answerFromThread } from "./answer-from-thread";
import { errMsg } from "./fs-helpers";
import { withImportExtension } from "./generated-import-extension";
import { registerLayoutRoute } from "./layout-route";
import { registerManageRoutes } from "./manage-routes";
import { formatProjectFiles } from "./project-format/format-project-files";
import type { ProjectState } from "./project-state/types";
import { registerRegistryRoutes } from "./registry-routes";
import type { WorkedResponse } from "./request-work";
import type { JsonResponse, RouteApp, RouteRequest } from "./route-types";
import { diffInThread } from "./spec-thread/diff-in-thread";
import { generateInThread } from "./spec-thread/generate-in-thread";
import { registerUpdateFlowRoutes } from "./update-routes";
import { validateDiffBody, validateGenerateBody } from "./validate-body";
import { registerWriteRoutes } from "./write-routes";

/** The app the routes mount on, whose answers tell when they have been sent. */
export interface ApisRouteApp extends RouteApp {
  post(
    path: string,
    handler: (req: RouteRequest, res: JsonResponse & WorkedResponse) => void | Promise<void>,
  ): void;
}

/** What the imports routes read the project from. */
export interface ApisRouteDeps {
  /**
   * The project Studio runs: the routes read its import declarations, never
   * load their own, and announce each change they make to the imports state.
   * Removing an import takes it out of the config alone on its reload chain.
   */
  project: ProjectState;
  /** The project root, symlinks resolved: where the imports state lives. */
  projectRoot: string;
  /**
   * Whether a request carries the project's token: only for a caller that
   * does, Studio formats the code it generates with the project's own
   * formatters, and reads the project's package.json and tsconfig to give
   * the code's imports the extension the project needs — each formatter is
   * a program of the project's, run as a process per file, and a caller
   * without the token writes nothing and has no file of the project read.
   * It generates or compares code for any other in a thread of its own,
   * within a budget, as it reads a specification for it; for every caller
   * so when this is not given.
   */
  holdsToken?: ((req: RouteRequest) => boolean) | undefined;
}

/**
 * Mount the API-import routes: generate, write, diff, and the imports list,
 * checks, management and updates. For a caller without the token, code is
 * generated and specifications compared in a thread of its own, within a
 * budget, and the code comes as the generator writes it, unformatted and
 * with no file of the project read.
 *
 * @param app - The Studio server's Express app
 * @param deps - The project the imports routes answer from
 *
 * @example
 * ```ts
 * registerApisRoutes(app, { project, projectRoot: root, holdsToken });
 * ```
 */
export function registerApisRoutes(app: ApisRouteApp, deps: ApisRouteDeps): void {
  app.post("/api/apis/generate", async (req, res) => {
    try {
      const body = validateGenerateBody(req.body, res);
      if (!body) return;
      /* No file of the project is read for a caller without the token — not
         even its package.json and tsconfig, which say whether its imports
         need an extension: its code is the generator's, with none. */
      if (deps.holdsToken?.(req) !== true) {
        await answerFromThread(res, "Code generation failed", (signal) =>
          generateInThread(body.spec, body.options, { trusted: false, signal }).then((files) => ({
            files,
          })),
        );
        return;
      }
      const files = generateCode(body.spec, withImportExtension(body.options, deps.projectRoot));
      /* Shown as they will be written: formatted as the project formats its code. */
      const {
        files: formatted,
        formattedWith,
        problem,
      } = await formatProjectFiles(deps.projectRoot, files);
      res.json({ files: formatted, formatting: { formattedWith, problem } });
    } catch (err) {
      res.status(400).json({ error: errMsg(err, "Code generation failed") });
    }
  });

  registerWriteRoutes(app, deps);
  registerLayoutRoute(app);

  app.post("/api/apis/diff", async (req, res) => {
    try {
      const body = validateDiffBody(req.body, res);
      if (!body) return;
      if (deps.holdsToken?.(req) !== true) {
        await answerFromThread(res, "Failed to diff specs", (signal) =>
          diffInThread(body.oldSpec, body.newSpec, { trusted: false, signal }),
        );
        return;
      }
      res.json(diffSpecs(body.oldSpec, body.newSpec));
    } catch (err) {
      res.status(400).json({ error: errMsg(err, "Failed to diff specs") });
    }
  });

  registerRegistryRoutes(app, deps);
  registerManageRoutes(app, deps);
  registerUpdateFlowRoutes(app, deps);
}

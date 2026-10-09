import { isRecord } from "../mocks-edit/is-record";
import type { ProjectState } from "../project-state/types";
import type { RouteApp } from "../route-types";
import type { AnswerObservations } from "../storage/answer-observations";
import { contractReport } from "./contract-report";
import { registerSchemaFixRoutes } from "./schema-edit/schema-fix-routes";

/** What the contract routes read and change. */
export interface ContractRouteDeps {
  project: ProjectState;
  answers: AnswerObservations;
  /** The project's root, links resolved */
  root: string;
}

/**
 * Mount the routes that tell how each endpoint's real answers stand against
 * its response schema, and forget what was seen of one:
 *
 * POST /api/contract/report — every endpoint with a response schema: confirmed, drifted or not yet observed
 * POST /api/contract/forget — forget what was seen of one endpoint (`{ source, endpoint }`), once its schema is fixed
 * POST /api/contract/fix/preview|apply|undo — change an endpoint's Zod schema to take its answers (see `registerSchemaFixRoutes`)
 *
 * @param app - The Studio server's Express app
 * @param deps - The project, and what its answers were seen to hold
 * @example
 * ```ts
 * registerContractRoutes(app, { project, answers: stores.answers, root });
 * ```
 */
export function registerContractRoutes(app: RouteApp, deps: ContractRouteDeps): void {
  app.post("/api/contract/report", (_req, res) => {
    const running = deps.project.snapshot().running;
    res.json({ endpoints: running ? contractReport(running.config.sources, deps.answers) : [] });
  });

  app.post("/api/contract/forget", (req, res) => {
    const { source, endpoint } = isRecord(req.body) ? req.body : {};
    if (typeof source !== "string" || typeof endpoint !== "string") {
      res.status(400).json({ error: "Name the endpoint to forget: { source, endpoint }." });
      return;
    }
    deps.answers.forget(source, endpoint);
    res.json({ forgotten: true });
  });

  registerSchemaFixRoutes(app, deps);
}

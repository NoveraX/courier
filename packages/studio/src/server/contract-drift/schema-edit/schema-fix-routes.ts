import { isRecord } from "@noverax/courier-cli/devkit";
import { runConfigEdit } from "../../config-edit/run-config-edit";
import type { ProjectState } from "../../project-state/types";
import type { RouteApp } from "../../route-types";
import type { AnswerObservations } from "../../storage/answer-observations";
import { type AppliedFix, applySchemaFix } from "./schema-fix-apply";
import { planSchemaFix, type SchemaFixPlan } from "./schema-fix-plan";
import { undoSchemaFix } from "./schema-fix-undo";

/** What the schema fix routes read and change. */
export interface SchemaFixRouteDeps {
  project: ProjectState;
  answers: AnswerObservations;
  /** The project's root, links resolved */
  root: string;
}

/**
 * Mount the routes that change an endpoint's response schema to take the
 * answers Studio saw: `POST /api/contract/fix/preview` plans the change and
 * shows its diff, `/apply` writes the change a person reviewed and runs
 * the config again, and `/undo` takes the last one back. Each takes
 * `{ source, endpoint }`; `/apply` also the plan's `digest`. All three
 * read or write the project's source, so each needs Studio's token.
 *
 * @param app - Studio's routes
 * @param deps - The project, the answers seen and the project's root
 * @example
 * ```ts
 * registerSchemaFixRoutes(app, { project, answers: stores.answers, root });
 * ```
 */
export function registerSchemaFixRoutes(app: RouteApp, deps: SchemaFixRouteDeps): void {
  const applied = new Map<string, AppliedFix>();
  const fixDeps = { answers: deps.answers, root: deps.root, applied };

  app.post("/api/contract/fix/preview", async (req, res) => {
    const endpoint = endpointOf(req.body);
    if (endpoint === undefined) return void res.status(400).json({ error: NAME_IT });
    const running = deps.project.snapshot().running;
    if (running === null) {
      return void res.json({
        status: "manual",
        reason: "Studio runs no config now, so it plans no change.",
      });
    }
    res.json(withoutTexts(await planSchemaFix(running, deps.answers, deps.root, endpoint)));
  });

  app.post("/api/contract/fix/apply", async (req, res) => {
    const endpoint = endpointOf(req.body);
    const digest = isRecord(req.body) ? req.body.digest : undefined;
    if (endpoint === undefined || typeof digest !== "string") {
      return void res
        .status(400)
        .json({ error: `${NAME_IT} with the digest of the change reviewed` });
    }
    const outcome = await runConfigEdit(deps.project, (tx) =>
      applySchemaFix(tx, fixDeps, { ...endpoint, digest }),
    );
    res.json(
      outcome.status === "stale" ? { ...outcome, preview: withoutTexts(outcome.preview) } : outcome,
    );
  });

  app.post("/api/contract/fix/undo", async (req, res) => {
    const endpoint = endpointOf(req.body);
    if (endpoint === undefined) return void res.status(400).json({ error: NAME_IT });
    res.json(await runConfigEdit(deps.project, (tx) => undoSchemaFix(tx, fixDeps, endpoint)));
  });
}

const NAME_IT = "Name the endpoint: { source, endpoint }";

function endpointOf(body: unknown): { source: string; endpoint: string } | undefined {
  if (!isRecord(body)) return undefined;
  const { source, endpoint } = body;
  return typeof source === "string" && typeof endpoint === "string"
    ? { source, endpoint }
    : undefined;
}

/* A page is shown the diff; the files' whole texts and paths on this machine stay here. */
function withoutTexts(plan: SchemaFixPlan): unknown {
  if (plan.status !== "ready") return plan;
  return { ...plan, files: plan.files.map(({ file, hunks }) => ({ file, hunks })) };
}

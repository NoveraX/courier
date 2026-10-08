import type { ProjectReads } from "../project-state/types";
import { sendRouteFailure } from "../route-failure";
import type { RouteApp } from "../route-types";
import type { SessionStore } from "../storage/session-rows";
import { planRecordedTest, type RecordedTestPlan } from "./recorded-test-plan";
import { RecordedTestRefusal } from "./recorded-test-refusal";
import { readTestBody, type TestBody } from "./test-body";
import { writeTestFiles } from "./write-test-files";

/** What the recorded-test routes read. */
export interface RecordedTestRouteDeps {
  /** The project root, symlinks resolved */
  root: string;
  sessions: SessionStore;
  project: Pick<ProjectReads, "snapshot">;
}

/**
 * Mount the routes that save a session's calls as a test:
 *
 * POST /api/tests/plan  — the files a test of a saved session (`{ id }`) or of the requests a page holds (`{ requests }`) writes, and the calls checked now
 * POST /api/tests/write — write them, once the plan is the one shown (`digest`) and a file it replaces was agreed to (`replace`)
 *
 * Both need the token: a plan runs the project's own formatters.
 *
 * @param app - The Studio server's Express app
 * @param deps - The project, and the saved sessions
 * @example
 * ```ts
 * registerRecordedTestRoutes(app, { root, sessions, project });
 * ```
 */
export function registerRecordedTestRoutes(app: RouteApp, deps: RecordedTestRouteDeps): void {
  app.post("/api/tests/plan", async (req, res) => {
    try {
      res.json(await planFor(readTestBody(req.body), deps));
    } catch (err) {
      sendRouteFailure(res, err, "Failed to plan the test");
    }
  });

  app.post("/api/tests/write", async (req, res) => {
    try {
      const body = readTestBody(req.body);
      const plan = await planFor(body, deps);
      if (plan.digest !== body.digest) {
        throw new RecordedTestRefusal(
          "PLAN_CHANGED",
          "The test is not the one shown any more — the requests or the project changed. Look at it again before writing it.",
        );
      }
      res.json({ written: writeTestFiles(deps.root, plan, body.replace) });
    } catch (err) {
      sendRouteFailure(res, err, "Failed to write the test");
    }
  });
}

async function planFor(body: TestBody, deps: RecordedTestRouteDeps): Promise<RecordedTestPlan> {
  const running = deps.project.snapshot().running;
  if (!running) {
    throw new RecordedTestRefusal(
      "NO_RUNNING_CONFIG",
      "Studio has no config running to check the calls against: fix courier.config so it loads, then ask again.",
    );
  }
  const saved = body.id === undefined ? undefined : deps.sessions.load(body.id);
  if (body.id !== undefined && !saved) {
    throw new RecordedTestRefusal("SESSION_NOT_FOUND", "Session not found");
  }
  return planRecordedTest(
    {
      title: body.title ?? saved?.name ?? "Recorded requests",
      folder: body.folder,
      requests: saved?.requests ?? body.requests,
    },
    { root: deps.root, configFile: running.configFile, sources: running.config.sources },
  );
}

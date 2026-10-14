import { isRecord } from "@noverax/courier-cli/devkit";
import type { StudioMocks } from "../mcp/mock-tools";
import type { RequestLog } from "../request-log";
import type { RouteApp } from "../route-types";
import { sanitizeMockCommand } from "../sanitize-mock-events";
import {
  CHAOS_PRESETS,
  type ConditionsWanted,
  conditionCommands,
  editorMocks,
  LATENCY_PRESETS,
} from "./editor-mocks";
import { editorRequests, type RequestsWanted } from "./editor-requests";

/** What the live routes read and change: the requests, and the mocks. */
export interface EditorLiveDeps {
  readonly requestLog: Pick<RequestLog, "keyEvents">;
  readonly mocks?: StudioMocks | undefined;
}

/**
 * The routes an editor's live views use:
 *
 * POST /api/editor/requests — the requests recorded, newest first (`{ failed?, source?, endpoint?, limit? }`)
 * POST /api/editor/mocks — the mocks, their scenarios and the delay and faults set on each
 * POST /api/editor/mocks/scenario — switch a mock's scenario (`{ mock, scenario }`), with the token
 * POST /api/editor/mocks/conditions — set a mock's delay or faults by preset, or stop both (`{ mock, latency?, chaos?, stop? }`), with the token
 *
 * The two that change a mock are among the routes that need Studio's token.
 *
 * @param app - The Studio server's Express app
 * @param deps - The requests and the mocks
 * @example
 * ```ts
 * registerEditorLiveRoutes(app, { requestLog, mocks: mockManager });
 * ```
 */
export function registerEditorLiveRoutes(app: RouteApp, deps: EditorLiveDeps): void {
  app.post("/api/editor/requests", (req, res) => {
    res.json({ requests: editorRequests(deps.requestLog.keyEvents(), requestsWanted(req.body)) });
  });

  app.post("/api/editor/mocks", (_req, res) => {
    res.json({ mocks: deps.mocks ? editorMocks(deps.mocks) : [] });
  });

  app.post("/api/editor/mocks/scenario", async (req, res) => {
    const { mock, scenario } = isRecord(req.body) ? req.body : {};
    if (typeof mock !== "string" || typeof scenario !== "string") {
      res.status(400).json({ error: "Name the mock and the scenario: { mock, scenario }." });
      return;
    }
    const command = sanitizeMockCommand({
      action: "mock:scenario:apply",
      serverId: mock,
      scenario,
    });
    const reply = command && deps.mocks?.forwardStoreCommand(command);
    if (!reply) {
      res.status(404).json({ error: `Studio runs no mock ${mock}.` });
      return;
    }
    const answered = await reply;
    if (answered.ok) res.json({ mock, activeScenario: scenario });
    else res.status(409).json({ error: answered.error ?? "The mock did not switch." });
  });

  app.post("/api/editor/mocks/conditions", async (req, res) => {
    const body = isRecord(req.body) ? req.body : {};
    const wanted = conditionsWanted(body);
    const state = deps.mocks?.describeServers().find((each) => each.serverId === body.mock);
    if (!wanted || !state || !deps.mocks) {
      res
        .status(wanted ? 404 : 400)
        .json({ error: wanted ? `Studio runs no mock ${String(body.mock)}.` : CONDITIONS_HELP });
      return;
    }
    for (const command of conditionCommands(state, wanted)) {
      const answered = await deps.mocks.forwardStoreCommand(command);
      if (answered && !answered.ok) {
        res.status(409).json({ error: answered.error ?? "The mock did not take the change." });
        return;
      }
    }
    res.json({ mock: state.serverId });
  });
}

const CONDITIONS_HELP = `Name the mock and what to set: { mock, latency?: ${LATENCY_PRESETS.join(" | ")}, chaos?: ${CHAOS_PRESETS.join(" | ")}, stop?: true }.`;

function requestsWanted(body: unknown): RequestsWanted {
  if (!isRecord(body)) return {};
  return {
    failed: body.failed === true,
    source: typeof body.source === "string" ? body.source : undefined,
    endpoint: typeof body.endpoint === "string" ? body.endpoint : undefined,
    limit: typeof body.limit === "number" ? body.limit : undefined,
  };
}

function conditionsWanted(body: Record<string, unknown>): ConditionsWanted | undefined {
  const latency = LATENCY_PRESETS.find((preset) => preset === body.latency);
  const chaos = CHAOS_PRESETS.find((preset) => preset === body.chaos);
  const stop = body.stop === true;
  if (typeof body.mock !== "string" || (!latency && !chaos && !stop)) return undefined;
  if ((body.latency !== undefined && !latency) || (body.chaos !== undefined && !chaos))
    return undefined;
  return { latency, chaos, stop };
}

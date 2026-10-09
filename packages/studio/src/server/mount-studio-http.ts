import type express from "express";

import type { DemoServing } from "./demo/demo-serving";
import type { AgentCalls } from "./mcp/agent-calls";
import { auditInputsOf } from "./mcp/audit-inputs";
import { mountStudioMcp } from "./mcp/mount-studio-mcp";
import type { LifecycleCoordinator } from "./mock-manager/lifecycle-coordinator";
import type { ProjectState } from "./project-state/types";
import { registerRestApi } from "./rest-api";
import type { RuntimePlaygroundRouter } from "./runtime-playground-router";
import { serveStudioUi } from "./serve-ui";
import { projectEnvironment } from "./session-file/project-environment";
import type { StudioStores } from "./storage/studio-stores";
import type { StorageWiring } from "./storage-space/storage-wiring";
import type { StudioOriginPolicy } from "./studio-origin";
import type { StudioStartup } from "./studio-startup";
import type { StudioToken } from "./studio-token";
import { studioVersion } from "./studio-version";
import { wholeBodyOf } from "./ui-bodies";
import type { WebhookDirectory } from "./webhooks/webhook-directory";

/** What Studio's HTTP side reads and drives. */
export interface StudioHttpParts {
  project: ProjectState;
  /** The project's root, links resolved */
  root: string;
  /** The project's root as it was given */
  projectRoot: string;
  startup: StudioStartup;
  mockManager: LifecycleCoordinator;
  stores: StudioStores;
  storage: StorageWiring;
  token: StudioToken;
  /** Runs the calls Studio makes itself: an agent's replays */
  playgroundRouter: Pick<RuntimePlaygroundRouter, "run">;
  /** The requests Studio runs for an agent, whose records name it */
  agentCalls: AgentCalls;
  /** The webhooks the attached applications define */
  webhooks: WebhookDirectory;
  /** How a public demo serves its visitors, when Studio is one */
  serving?: DemoServing | undefined;
}

/**
 * Mount Studio's HTTP side: its REST API — the routes an editor reads among
 * them — its MCP endpoint, and its page. A public demo gets no editor routes
 * and no MCP endpoint: its visitors have no token, and its requests are no
 * one's editor's or agent's.
 *
 * @param app - The Studio server's Express app
 * @param policy - Decides who counts as the Studio UI
 * @param parts - What the routes read and drive
 * @example
 * ```ts
 * mountStudioHttp(app, policy, { project, root, projectRoot, startup, mockManager, stores, storage, token, playgroundRouter, agentCalls });
 * ```
 */
export function mountStudioHttp(
  app: ReturnType<typeof express>,
  policy: StudioOriginPolicy,
  parts: StudioHttpParts,
): void {
  const { project, root, projectRoot, startup, mockManager, stores, storage, token, serving } =
    parts;
  const { requestLog, sessions, view } = stores;
  registerRestApi(app, policy, {
    apis: { project, projectRoot: root },
    configEdit: { project, projectRoot: root },
    mocksEdit: {
      projectRoot,
      mockBasePort: startup.mockBasePort,
      project,
      studioPort: startup.port,
      mockSummaries: mockManager.summarizeServers,
    },
    sessions: {
      sessions,
      view,
      environment: projectEnvironment(root, project, { host: !serving }),
    },
    storage: storage.routes,
    tests: { root, sessions, project },
    contract: { project, answers: stores.answers, root },
    editor: serving ? undefined : { project, requestLog, root },
    webhooks: serving ? undefined : parts.webhooks,
    token,
    demo: serving && { limits: serving.limits },
  });
  if (!serving) {
    mountStudioMcp(app, {
      token,
      version: studioVersion(),
      requestLog,
      mocks: mockManager,
      replays: { run: parts.playgroundRouter.run, wholeBody: wholeBodyOf },
      agentCalls: parts.agentCalls,
      audit: auditInputsOf(project, root),
    });
  }
  serveStudioUi(app);
}

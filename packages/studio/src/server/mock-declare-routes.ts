/**
 * The routes Studio's mock wizard adds mocks through: a preview of the edit
 * to `courier.mocks.ts`, and its application.
 *
 * They write a file Studio then executes, so beyond the origin guard every
 * API route has, they answer only a browser page (it sends an Origin) on
 * this machine: a request from elsewhere on the network, even one that
 * passes the origin check, gets the snippet to add by hand instead.
 */

import { realpathSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { createLogger } from "@noverax/courier";
import { applyMocksEdit } from "./mocks-edit/apply-mocks-edit";
import { describeError } from "./mocks-edit/describe-error";
import { isLocalPeer } from "./mocks-edit/is-local-peer";
import { manualOutcome } from "./mocks-edit/manual-outcome";
import type { MocksEditContext } from "./mocks-edit/mocks-edit-context";
import { MocksEditRefusal } from "./mocks-edit/mocks-edit-refusal";
import { previewMocksEdit } from "./mocks-edit/preview-mocks-edit";
import { snippetInputUnread } from "./mocks-edit/snippet-input-unread";
import type { ManualOutcome, MockDeclaration } from "./mocks-edit/types";
import { validateDeclarations } from "./mocks-edit/validate-declarations";
import { type DeclareBody, validateDeclareBody } from "./mocks-edit/validate-declare-body";

const log = createLogger("Studio");

interface DeclareRequest extends IncomingMessage {
  body: unknown;
}

interface DeclareResponse {
  status(code: number): DeclareResponse;
  json(data: unknown): void;
}

/** The part of Studio's Express app the routes are mounted on. */
interface DeclareRouteApp {
  post(path: string, handler: (req: DeclareRequest, res: DeclareResponse) => void): void;
}

/**
 * Mount the wizard's routes. Call after the origin guard and the JSON parser.
 *
 * @param app - The Studio server's Express app
 * @param ctx - The running Studio the edit reads and changes
 */
export function registerMockDeclareRoutes(app: DeclareRouteApp, ctx: MocksEditContext): void {
  app.post("/api/mocks/declare/preview", (req, res) => void handle(req, res, ctx, "preview"));
  app.post("/api/mocks/declare/apply", (req, res) => void handle(req, res, ctx, "apply"));
}

interface Reply {
  status: number;
  body: unknown;
}

async function handle(
  req: DeclareRequest,
  res: DeclareResponse,
  ctx: MocksEditContext,
  mode: "preview" | "apply",
): Promise<void> {
  const reply = await answer(req, ctx, mode);
  res.status(reply.status).json(reply.body);
}

/* A caller other than a browser page on this machine gets no answer that
   reads the project: a 403 without an Origin, and for another machine a
   snippet built from its own request. */
async function answer(
  req: DeclareRequest,
  ctx: MocksEditContext,
  mode: "preview" | "apply",
): Promise<Reply> {
  if (!req.headers.origin) {
    return {
      status: 403,
      body: { error: "Only the Studio page in a browser can add mocks through Studio." },
    };
  }
  const parsed = validateDeclareBody(req.body, mode);
  if (!parsed.ok) return { status: 400, body: { error: parsed.message } };
  /* Before any snippet is built from the request: its keys and sources must
     be what they claim, or the snippet would carry them as code. */
  const errors = validateDeclarations(parsed.value.mocks, null);
  if (errors.length > 0) return { status: 200, body: { status: "invalid", errors } };
  if (!isLocalPeer(req.socket.remoteAddress))
    return { status: 200, body: notLocal(parsed.value.mocks) };
  return perform(ctx, mode, parsed.value);
}

async function perform(
  ctx: MocksEditContext,
  mode: "preview" | "apply",
  body: DeclareBody,
): Promise<Reply> {
  try {
    const result =
      mode === "preview"
        ? await previewMocksEdit(ctx, body.mocks)
        : await applyMocksEdit(ctx, body);
    return { status: 200, body: result };
  } catch (err) {
    log.error(`Studio could not ${mode} adding mocks`, err);
    const reason = describeError(err, resolvedRoot(ctx.projectRoot));
    return { status: 500, body: { error: `Studio could not ${mode} adding the mocks: ${reason}` } };
  }
}

/* The loader names files by their resolved path; a root that is itself gone
   is shown as given. */
function resolvedRoot(projectRoot: string): string {
  try {
    return realpathSync(projectRoot);
  } catch (err) {
    log.debug(`${projectRoot} could not be resolved`, err);
    return projectRoot;
  }
}

function notLocal(requests: readonly MockDeclaration[]): ManualOutcome {
  const refusal = new MocksEditRefusal(
    "NOT_LOCAL_PEER",
    "Studio edits project files only for a browser on this machine. Add the mocks to your mocks file by hand, or open Studio on the machine it runs on.",
  );
  return manualOutcome(refusal, snippetInputUnread(requests), null);
}

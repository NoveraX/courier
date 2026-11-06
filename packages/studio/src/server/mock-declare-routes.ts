/**
 * The routes Studio edits `courier.mocks.ts` through: the mock wizard's,
 * which declare mocks, and Add to mock's, which add endpoints to the list a
 * mock answers — each a preview of the edit, and its application.
 *
 * They write a file Studio then executes, so beyond the origin guard every
 * API route has, they answer only a browser page (it sends an Origin) on
 * this machine: a request from elsewhere on the network, even one that
 * passes the origin check, gets the snippet to add by hand instead.
 */

import type { IncomingMessage } from "node:http";
import { createLogger } from "@noverax/courier";
import { resolvedRoot } from "@noverax/courier-cli/devkit";
import { ConfigLoaderError } from "./config-loader-errors";
import { describeError } from "./describe-error";
import { applyEdit } from "./mocks-edit/apply-mocks-edit";
import { declareRequest } from "./mocks-edit/declare-request";
import type { MocksEditRequest } from "./mocks-edit/edit-intent";
import { endpointsRequest } from "./mocks-edit/endpoints-request";
import { isLocalPeer } from "./mocks-edit/is-local-peer";
import { manualOutcome, manualOutcomeOf } from "./mocks-edit/manual-outcome";
import type { MocksEditContext } from "./mocks-edit/mocks-edit-context";
import { MocksEditRefusal } from "./mocks-edit/mocks-edit-refusal";
import { endpointsSnippet } from "./mocks-edit/prepare-endpoints-edit";
import { previewEdit } from "./mocks-edit/preview-mocks-edit";
import type { Checked } from "./mocks-edit/read-fields";
import { snippetInputUnread } from "./mocks-edit/snippet-input-unread";
import type { InvalidOutcome, ManualOutcome } from "./mocks-edit/types";
import { validateDeclarations } from "./mocks-edit/validate-declarations";
import {
  type DeclareBody,
  type DeclareMode,
  validateDeclareBody,
} from "./mocks-edit/validate-declare-body";
import { type EndpointsBody, validateEndpointsBody } from "./mocks-edit/validate-endpoints-body";

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

/** One kind of edit the routes make: how its body is read, and what it is. */
interface EditRoute<TBody> {
  /** What it does, for messages: `add mocks`. */
  does: string;
  /** The same, as what Studio was doing when it failed: `adding the mocks`. */
  doing: string;
  read(body: unknown, mode: DeclareMode): Checked<TBody>;
  /** What is wrong with the values, which a snippet built from them would carry as code. */
  invalid(body: TBody): InvalidOutcome | null;
  /** What a caller on another machine is given to do by hand. */
  elsewhere(body: TBody, refusal: MocksEditRefusal): ManualOutcome;
  request(ctx: MocksEditContext, body: TBody): MocksEditRequest;
}

const DECLARE: EditRoute<DeclareBody> = {
  does: "add mocks",
  doing: "adding the mocks",
  read: validateDeclareBody,
  invalid: (body) => {
    const errors = validateDeclarations(body.mocks, null);
    return errors.length > 0 ? { status: "invalid", errors } : null;
  },
  elsewhere: (body, refusal) => manualOutcome(refusal, snippetInputUnread(body.mocks), null),
  request: declareRequest,
};

const ENDPOINTS: EditRoute<EndpointsBody> = {
  does: "add endpoints to a mock",
  doing: "adding the endpoints",
  read: validateEndpointsBody,
  invalid: () => null,
  elsewhere: (body, refusal) =>
    manualOutcomeOf(refusal, { target: null, creates: false, snippet: endpointsSnippet(body) }),
  request: endpointsRequest,
};

/**
 * Mount the routes that edit the mocks file: the wizard's, and Add to
 * mock's. Call after the origin guard and the JSON parser.
 *
 * @param app - The Studio server's Express app
 * @param ctx - The running Studio the edit reads and changes
 */
export function registerMockDeclareRoutes(app: DeclareRouteApp, ctx: MocksEditContext): void {
  mount(app, ctx, "/api/mocks/declare", DECLARE);
  mount(app, ctx, "/api/mocks/endpoints", ENDPOINTS);
}

function mount<TBody>(
  app: DeclareRouteApp,
  ctx: MocksEditContext,
  path: string,
  route: EditRoute<TBody>,
): void {
  for (const mode of ["preview", "apply"] as const) {
    app.post(`${path}/${mode}`, (req, res) => void handle(req, res, ctx, route, mode));
  }
}

interface Reply {
  status: number;
  body: unknown;
}

async function handle<TBody>(
  req: DeclareRequest,
  res: DeclareResponse,
  ctx: MocksEditContext,
  route: EditRoute<TBody>,
  mode: DeclareMode,
): Promise<void> {
  const reply = await answer(req, ctx, route, mode);
  res.status(reply.status).json(reply.body);
}

/* A caller other than a browser page on this machine gets no answer that
   reads the project: a 403 without an Origin, and for another machine a
   snippet built from its own request. */
async function answer<TBody>(
  req: DeclareRequest,
  ctx: MocksEditContext,
  route: EditRoute<TBody>,
  mode: DeclareMode,
): Promise<Reply> {
  if (!req.headers.origin) {
    return {
      status: 403,
      body: { error: `Only the Studio page in a browser can ${route.does} through Studio.` },
    };
  }
  const parsed = route.read(req.body, mode);
  if (!parsed.ok) return { status: 400, body: { error: parsed.message } };
  /* Before any snippet is built from the request: its values must be what
     they claim, or the snippet would carry them as code. */
  const invalid = route.invalid(parsed.value);
  if (invalid) return { status: 200, body: invalid };
  if (!isLocalPeer(req.socket.remoteAddress)) {
    const refusal = new MocksEditRefusal(
      "NOT_LOCAL_PEER",
      "Studio edits project files only for a browser on this machine. Make the edit to your mocks file by hand, or open Studio on the machine it runs on.",
    );
    return { status: 200, body: route.elsewhere(parsed.value, refusal) };
  }
  return perform(ctx, mode, route, route.request(ctx, parsed.value));
}

async function perform<TBody>(
  ctx: MocksEditContext,
  mode: DeclareMode,
  route: EditRoute<TBody>,
  request: MocksEditRequest,
): Promise<Reply> {
  try {
    const result =
      mode === "preview" ? await previewEdit(ctx, request) : await applyEdit(ctx, request);
    return { status: 200, body: result };
  } catch (err) {
    if (err instanceof ConfigLoaderError && err.httpStatus !== undefined) {
      return { status: err.httpStatus, body: { error: err.message, code: err.code } };
    }
    log.error(`Studio could not ${mode} ${route.doing}`, err);
    const reason = describeError(err, resolvedRoot(ctx.projectRoot));
    return { status: 500, body: { error: `Studio could not ${mode} ${route.doing}: ${reason}` } };
  }
}

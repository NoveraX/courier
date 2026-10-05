/**
 * The routes the import wizard declares an import through once its files
 * are written: a preview of the change to courier.config.ts, and its
 * application.
 *
 * They change a file Studio then executes, so beyond the origin guard every
 * API route has, they act only for a browser page (it sends an Origin) on
 * this machine: a request from elsewhere on the network gets the lines to
 * add by hand instead.
 */

import type { IncomingMessage } from "node:http";
import { applyConfigDeclaration } from "./config-edit/apply-config-declaration";
import type { DeclareApplyResult, DeclarePreview } from "./config-edit/config-declare-types";
import type { ConfigEditDeps } from "./config-edit/declare-alone";
import { prepareConfigDeclaration } from "./config-edit/prepare-config-declaration";
import { previewOf } from "./config-edit/preview-of";
import { isLocalPeer } from "./mocks-edit/is-local-peer";
import { isRecord } from "./mocks-edit/is-record";
import { readConfigToAct } from "./project-state/read-config-to-act";
import { resolvedRoot } from "./resolved-root";
import { sendRouteFailure } from "./route-failure";
import type { JsonResponse } from "./route-types";
import { readWriteBody } from "./write-body";
import type { WriteBody } from "./write-types";

interface DeclareRequest extends IncomingMessage {
  body: unknown;
}

/** The part of Studio's Express app the routes are mounted on. */
interface DeclareRouteApp {
  post(path: string, handler: (req: DeclareRequest, res: JsonResponse) => void): void;
}

const BODY_ERROR = "Expected { sourceName, spec, options } with the spec as Studio parsed it";

/**
 * Mount the routes. Call after the origin guard and the JSON parser.
 *
 * @param app - The Studio server's Express app
 * @param deps - The project the change reads and makes, and its root
 * @example
 * ```ts
 * registerConfigDeclareRoutes(app, { project, projectRoot: root });
 * ```
 */
export function registerConfigDeclareRoutes(app: DeclareRouteApp, deps: ConfigEditDeps): void {
  app.post("/api/apis/declare/preview", (req, res) => {
    const body = readWriteBody(req.body);
    if (!guard(req, res, body)) return;
    respond(res, preview(deps, body, isLocalPeer(req.socket.remoteAddress)), "preview");
  });
  app.post("/api/apis/declare/apply", (req, res) => {
    const body = readWriteBody(req.body);
    if (!guard(req, res, body)) return;
    const baseHash = isRecord(req.body) ? req.body.baseHash : undefined;
    if (typeof baseHash !== "string") {
      res.status(400).json({ error: "Expected the baseHash of the preview being applied" });
      return;
    }
    const local = isLocalPeer(req.socket.remoteAddress);
    const result = local
      ? applyConfigDeclaration(deps, body, baseHash)
      : preview(deps, body, false);
    respond(res, result, "apply");
  });
}

function guard(req: DeclareRequest, res: JsonResponse, body: WriteBody | null): body is WriteBody {
  if (!req.headers.origin) {
    res.status(403).json({
      error: "Only the Studio page in a browser can change courier.config through Studio.",
    });
    return false;
  }
  if (body === null) {
    res.status(400).json({ error: BODY_ERROR });
    return false;
  }
  return true;
}

/* Another machine gets the lines to add by hand, never a change it could apply. */
async function preview(
  deps: ConfigEditDeps,
  body: WriteBody,
  local: boolean,
): Promise<DeclarePreview> {
  const root = resolvedRoot(deps.projectRoot);
  const loaded = await readConfigToAct(deps.project, root);
  const prepared = prepareConfigDeclaration(body, loaded, root);
  const shown = previewOf(prepared);
  if (local || shown.status !== "ready" || prepared === null) return shown;
  return {
    status: "manual",
    code: "NOT_LOCAL_PEER",
    reason:
      "Studio changes project files only for a browser on this machine. Add these lines by hand, or open Studio on the machine it runs on.",
    declaration: prepared.declaration,
  };
}

function respond(
  res: JsonResponse,
  work: Promise<DeclarePreview | DeclareApplyResult>,
  mode: "preview" | "apply",
): void {
  void work.then(
    (result) => res.json(result),
    (err: unknown) => sendRouteFailure(res, err, `Studio could not ${mode} declaring the import`),
  );
}

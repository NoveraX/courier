/**
 * The route the import wizard reads a specification through: pasted, from
 * a URL, or from a file of the project.
 */

import { CourierError } from "@noverax/courier";
import {
  errnoCode,
  NotRegularFileError,
  projectRootAt,
  readProjectText,
} from "@noverax/courier-cli/devkit";
import { DEMO_FILE_REFUSAL } from "./demo/demo-refusals";
import { DEMO_MAX_SPEC } from "./demo/demo-rest-guard";
import { fetchSpec } from "./fetch-spec";
import { errMsg } from "./fs-helpers";
import { MAX_MESSAGE_BYTES } from "./max-message-bytes";
import type { ProjectReads } from "./project-state/types";
import { type RequestWork, requestWork, type WorkedResponse } from "./request-work";
import { sendRouteFailure } from "./route-failure";
import type { JsonResponse, RouteRequest } from "./route-types";
import { SpecFetchError } from "./spec-fetch-error";
import { specHostAllowlist } from "./spec-host-allowlist";
import { readSpecInProcess } from "./spec-jobs/read-spec-in-process";
import { type ParseBody, validateParseBody } from "./validate-body";

/** What the route answers on: JSON it builds, or the specification's JSON as its process wrote it. */
export interface ParseResponse extends JsonResponse, WorkedResponse {
  setHeader(name: string, value: string): unknown;
  end(body: string): unknown;
}

/** The part of Studio's Express app the route is mounted on. */
export interface ParseRouteApp {
  post(path: string, handler: (req: RouteRequest, res: ParseResponse) => Promise<void>): void;
}

/** What the route reads, and whom it reads for. */
export interface ParseRouteDeps {
  /** The project, whose `studio.allowedSpecHosts` a URL on a private host is checked against. */
  project: ProjectReads;
  /** The project root, symlinks resolved. */
  projectRoot: string;
  /** Whether a request carries the project's token. */
  holdsToken(req: RouteRequest): boolean;
  /** Whether Studio serves a public demo, whose visitors are told so. */
  demo: boolean;
}

const FILE_REFUSAL =
  "Studio reads a file of the project only for a page opened from the link it printed in its terminal, which carries this project's token. Paste the specification, or give its URL.";

const DEMO_PUBLIC_ONLY =
  "in this demo, Studio reads a specification for a visitor from the public internet only: from a host whose name resolves to a public address";

/**
 * Mount `POST /api/apis/parse`. A caller with the project's token has Studio
 * read a file of the project, or a URL on whatever the project allows; a
 * caller without it — on a public demo or not — has it read the text as
 * pasted, or a URL on the public internet. Every text is read in a process
 * of its own, within a budget, and the work stops once the caller goes away.
 * A demo's visitor is read a specification no larger, as JSON, than it can
 * send back to have its code generated.
 *
 * @param app - The Studio server's Express app
 * @param deps - The project, and whom the route reads for
 * @example
 * ```ts
 * registerParseRoute(app, { project, projectRoot: root, holdsToken, demo: false });
 * ```
 */
export function registerParseRoute(app: ParseRouteApp, deps: ParseRouteDeps): void {
  app.post("/api/apis/parse", async (req, res) => {
    const body = validateParseBody(req.body, res);
    if (!body) return;
    const trusted = deps.holdsToken(req);
    if (!trusted && body.source === "file") {
      refuseFile(res, deps.demo);
      return;
    }
    const work = requestWork(res);
    try {
      const json = await work.hold(readSpec(body, trusted, work, deps));
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(json);
    } catch (err) {
      /* The caller has gone: nothing reads the answer. */
      if (!work.signal.aborted) answerFailure(res, err);
    }
  });
}

/* Refused before the path is looked at, so the answer says nothing of the file. */
function refuseFile(res: JsonResponse, demo: boolean): void {
  if (demo) res.status(403).json({ error: DEMO_FILE_REFUSAL, code: "STUDIO_DEMO_REFUSED" });
  else res.status(401).json({ error: FILE_REFUSAL, code: "STUDIO_TOKEN_REQUIRED" });
}

async function readSpec(
  { source, content }: ParseBody,
  trusted: boolean,
  { signal }: RequestWork,
  deps: ParseRouteDeps,
): Promise<string> {
  const text = await specText({ source, content }, trusted, signal, deps);
  const url = source === "url" ? content : undefined;
  const maxBytes = deps.demo && !trusted ? DEMO_MAX_SPEC : MAX_MESSAGE_BYTES;
  return readSpecInProcess({ text, url }, { trusted, signal, maxBytes });
}

async function specText(
  { source, content }: ParseBody,
  trusted: boolean,
  signal: AbortSignal,
  { project, projectRoot, demo }: ParseRouteDeps,
): Promise<string> {
  if (source === "raw") return content;
  if (source === "file") return readProjectText(projectRootAt(projectRoot), content);
  return fetchSpec(content, specHostAllowlist(project, projectRoot), {
    reach: trusted ? "project" : "public",
    ...(demo && { publicOnly: DEMO_PUBLIC_ONLY }),
    signal,
  });
}

/* A host that could not be read is the server's failure, not the request's;
   what is wrong with the text or the file is the request's; any other error
   is answered with its own status, or logged as Studio's own failure. */
function answerFailure(res: JsonResponse, err: unknown): void {
  if (err instanceof SpecFetchError) {
    res.status(err.refused ? 400 : 502).json({ error: err.message });
    return;
  }
  if (isRequestFault(err)) {
    res.status(400).json({ error: errMsg(err, "Failed to parse spec") });
    return;
  }
  sendRouteFailure(res, err, "Failed to parse spec");
}

/* The parser's verdict on the text, or the file system's on the file named. */
function isRequestFault(err: unknown): boolean {
  if (err instanceof NotRegularFileError) return true;
  if (err instanceof CourierError) return "httpStatus" in err && err.httpStatus === 400;
  return errnoCode(err) !== undefined;
}

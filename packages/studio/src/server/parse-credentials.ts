/**
 * The parse route's credentials: whom Studio sends them for, and the
 * specification of an import courier.config declares, read with the URL and
 * the auth the config gives it, which the page never needs.
 */

import { urlWithoutSecrets } from "@noverax/courier/internal";

import { DEMO_CREDENTIALS_REFUSAL } from "./demo/demo-refusals";
import { isLocalPeer } from "./mocks-edit/is-local-peer";
import { readDeclarations } from "./project-state/read-declarations";
import type { ProjectReads } from "./project-state/types";
import type { JsonResponse, RouteRequest } from "./route-types";
import type { SpecRead } from "./validate-body";

const CREDENTIALS_REFUSAL =
  "Studio sends a specification's credentials only for a page opened from the link it printed in its terminal, which carries this project's token.";

const ELSEWHERE_REFUSAL =
  "Studio reads the project's variables for a specification's credentials only for a page on the machine it runs on. Import the specification there, or run courier-studio import with --bearer-env, --basic-env or --header-env on that machine.";

/** What a declared import is looked up in, and whom the route reads for. */
export interface DeclaredSpecDeps {
  project: ProjectReads;
  projectRoot: string;
  /** Whether Studio serves a public demo, whose visitors are told so. */
  demo: boolean;
}

/**
 * Refuse a page without the project's token a read with credentials: it
 * would have Studio send its environment's secrets, or its config's, to a
 * host. A demo's visitor is told what the demo reads for them.
 *
 * @param res - What the refusal is answered on
 * @param demo - Whether Studio serves a public demo
 * @example
 * ```ts
 * if (!trusted && body.auth !== undefined) return refuseCredentials(res, deps.demo);
 * ```
 */
export function refuseCredentials(res: JsonResponse, demo: boolean): void {
  if (demo) res.status(403).json({ error: DEMO_CREDENTIALS_REFUSAL, code: "STUDIO_DEMO_REFUSED" });
  else res.status(401).json({ error: CREDENTIALS_REFUSAL, code: "STUDIO_TOKEN_REQUIRED" });
}

/**
 * Refuse a page on another machine — a phone, a laptop on the same network
 * — the secrets the project's `.env*` files give Studio, as the page names
 * the host a credential goes to. So Studio sends a variable, and says
 * whether one is set, only for a page on the machine it runs on, as it
 * edits project files only for one; it is refused 403 `NOT_LOCAL_PEER`,
 * even with the project's token.
 *
 * @param req - The request, whose peer says which machine sent it
 * @param res - What the refusal is answered on
 * @returns `true` once refused
 * @example
 * ```ts
 * if (body.auth !== undefined && refusedElsewhere(req, res)) return;
 * ```
 */
export function refusedElsewhere(req: RouteRequest, res: JsonResponse): boolean {
  if (isLocalPeer(req.socket?.remoteAddress)) return false;
  res.status(403).json({ error: ELSEWHERE_REFUSAL, code: "NOT_LOCAL_PEER" });
  return true;
}

/**
 * The read of an import courier.config declares: its URL, with its auth.
 * An import the config does not declare is answered 404, one read from no
 * URL 400, and one whose URL or auth carries a credential is refused to a
 * page without the project's token.
 *
 * @param name - The import, as courier.config names it
 * @param trusted - Whether the page holds the project's token
 * @param res - What a refusal is answered on
 * @param deps - The project, and whom the route reads for
 * @returns The read, or `null` once refused
 * @example
 * ```ts
 * const read = await declaredSpecRead("orders", trusted, res, deps);
 * ```
 */
export async function declaredSpecRead(
  name: string,
  trusted: boolean,
  res: JsonResponse,
  deps: DeclaredSpecDeps,
): Promise<SpecRead | null> {
  const declarations = await readDeclarations(deps.project, deps.projectRoot, "show");
  const entry = Object.hasOwn(declarations, name) ? declarations[name] : undefined;
  if (entry === undefined) {
    res.status(404).json({ error: `Import "${name}" not found in config` });
    return null;
  }
  if (entry.importType !== "url") {
    res.status(400).json({ error: `Import "${name}" is read from no URL; give its specification` });
    return null;
  }
  if (!trusted && (entry.auth !== undefined || urlWithoutSecrets(entry.from) !== entry.from)) {
    refuseCredentials(res, deps.demo);
    return null;
  }
  return { source: "url", content: entry.from, auth: entry.auth };
}

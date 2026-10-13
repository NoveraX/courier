import { isHTTPError } from "@noverax/courier";

import { post } from "@/lib/api-client";
import { isTokenRefusal } from "@/lib/token-refusal";
import { isPlainObject } from "@/socket/is-plain-object";

/** Where the project's code calls an endpoint. */
export interface CallSite {
  /** The file, relative to the project's root */
  file: string;
  /** Its absolute path, which an editor opens */
  path: string;
  line: number;
  column: number;
  /** The line as written */
  code: string;
}

/** Where the code calls an endpoint, as far as Studio has found out. */
export type CallSites =
  | { status: "loading" }
  | { status: "ready"; sites: CallSite[] }
  /* A public demo reads no project's code for its visitors. */
  | { status: "unavailable" }
  /* Studio shows the project's code only to a page that has its token. */
  | { status: "needs-token" }
  | { status: "failed"; message: string };

const FRESH_MS = 10_000;
const known = new Map<string, { at: number; found: CallSites }>();

/**
 * Where the code calls an endpoint, as last found within ten seconds.
 *
 * @param source - The endpoint's source
 * @param endpoint - Its call in the client: `orders.place`
 * @returns The call sites found, or `undefined` before they are
 * @example
 * ```ts
 * knownCallSites("shop", "orders.place")?.status;
 * ```
 */
export function knownCallSites(source: string, endpoint: string): CallSites | undefined {
  const entry = known.get(`${source}:${endpoint}`);
  return entry && Date.now() - entry.at < FRESH_MS ? entry.found : undefined;
}

/**
 * Ask Studio where the project's code calls an endpoint, and keep what it
 * says for ten seconds. Studio shows the code only to a page that has the
 * project's token, which one opened from the link Studio printed has.
 *
 * @param source - The endpoint's source
 * @param endpoint - Its call in the client
 * @returns The call sites, or why there are none to show
 * @example
 * ```ts
 * const found = await findCallSites("shop", "orders.place");
 * ```
 */
export async function findCallSites(source: string, endpoint: string): Promise<CallSites> {
  let found: CallSites;
  try {
    found = {
      status: "ready",
      sites: sitesOf(await post("/api/editor/sites", { source, endpoint })),
    };
  } catch (error) {
    found = failureOf(error);
  }
  known.set(`${source}:${endpoint}`, { at: Date.now(), found });
  return found;
}

function sitesOf(value: unknown): CallSite[] {
  if (!isPlainObject(value) || !Array.isArray(value.sites)) return [];
  return value.sites.filter(isCallSite);
}

function isCallSite(value: unknown): value is CallSite {
  return (
    isPlainObject(value) &&
    typeof value.file === "string" &&
    typeof value.path === "string" &&
    typeof value.line === "number" &&
    typeof value.column === "number" &&
    typeof value.code === "string"
  );
}

function failureOf(error: unknown): CallSites {
  if (isTokenRefusal(error)) return { status: "needs-token" };
  if (statusOf(error) === 404) return { status: "unavailable" };
  return { status: "failed", message: messageOf(error) };
}

/* Studio's refusal wraps the HTTP error it came with. */
function statusOf(error: unknown): number | undefined {
  if (isHTTPError(error)) return error.status;
  if (error instanceof Error && isHTTPError(error.cause)) return error.cause.status;
  return undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Studio could not look for the call sites";
}

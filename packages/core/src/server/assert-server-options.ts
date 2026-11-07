import { agentOptionsOf } from "../agent/agent-options";
import type { AgentMark } from "../define/agent-mark";
import { getSourceName } from "../define/api";
import type { AnySource } from "../define/types";
import { ConfigurationError } from "../errors/configuration-error";
import { eachEndpoint } from "../openapi/endpoints";
import type { SessionTarget } from "../session/session-target";
import type { ForwardOptions, SessionOptions } from "../session/types";
import { fieldOf } from "../transport/direct/read-definition";
import { holdInPlace, type ReadOption, readOption } from "./held-in-place";
import { describe } from "./plain-data";
import { assertSessionApi } from "./session/assert-session-api";
import { assertForwardOptions } from "./session/validate-forward";
import { assertSessionOptions } from "./session/validate-session";

/** What a server holds of an API's options, as the check read them: what a call takes of them. */
export interface HeldOptions {
  /** The options they are held of, the object the server took up */
  readonly options: object;
  readonly session: SessionOptions | undefined;
  readonly forward: ForwardOptions | undefined;
}

/* What a server holds of an API's options, by the object it took them up in, with the options of
   each endpoint checked beside them, and the APIs it took up whole with them. */
interface TakenUp extends HeldOptions {
  readonly endpoints: WeakSet<object>;
  readonly apis: WeakSet<object>;
}

/* An endpoint's options, as the check reads them beside an API's. */
interface EndpointRead {
  readonly owner: object;
  readonly at: string;
  readonly list: unknown;
  readonly agent: unknown;
  /** What was read of them now; nothing where a server holds them already */
  readonly read: readonly ReadOption[];
}

const takenUp = new WeakMap<object, TakenUp>();
/* The header list a server holds of each endpoint's options, by the object: an endpoint two APIs
   share, or one put in another API, is read and held once, as the first to take it up read it. */
const heldLists = new WeakMap<object, unknown>();
/* Options an API or a call's endpoint does not have, of which there is nothing to hold. */
const NO_OPTIONS: object = Object.freeze({});

/**
 * Check, where a server takes an API up, the options a server reads: the
 * user's `session`, what it `forward`s, that no header list carries
 * cookies past the session, and how each endpoint is offered to agents. A
 * server refuses an API that cannot work as written before its first call,
 * whatever `NODE_ENV` says — a bundler replaces `NODE_ENV` in a server's
 * build too. Each option is read once, into a copy of its data, and the
 * checks read the copy alone: what each option is first — data, a list of
 * names — then what they mean together. The copy is what a server holds:
 * in place of the session, `forward` and the header lists of the API and
 * its endpoints, and of how each endpoint is offered to agents, frozen to
 * its depths, so a change made through the API later fails where it is
 * made rather than sending, or offering, what no check read; an option the
 * API does not name is held unset, so none is set later. The objects the
 * API was given stay their owner's. An option in options its user froze,
 * where no copy can take its place, passes only where it is frozen to its
 * depths as well. Only data passes the check — objects of plain data and
 * lists of strings — so the copy holds all of it. A server knows what it
 * holds by the objects it took up, the API's options and each endpoint's:
 * options put in their place are checked as these are before a call takes
 * them (`heldForCall`), and an endpoint the API is given later as well, or
 * here first, where its sources are registered again or another way in
 * takes the API up whole. A page carries none of this: it reads its
 * session's `bearer`, `csrf` and `allowHttp` itself, and checks, as each
 * call goes, only where the session is sent.
 *
 * @param api - The API
 * @param where - Its name, for the errors
 * @returns What the server holds of the API's options
 * @throws ConfigurationError `SESSION_OPTIONS_INVALID`, `SESSION_INSECURE_TRANSPORT`,
 *   `SESSION_HEADER_CONFLICT`, `FORWARD_OPTIONS_INVALID`, `HEADER_LIST_INVALID` or
 *   `AGENT_OPTIONS_INVALID`
 * @example
 * ```ts
 * assertServerOptions(api, "accounts");
 * ```
 */
export function assertServerOptions(api: AnySource, where: string): HeldOptions {
  return takeUp(api, api.options ?? NO_OPTIONS, where, undefined);
}

/**
 * What a server holds of an API's options, the API taken up first where
 * the server took none of them up with it — as a server's caller does,
 * made for each request as it may be, or `ensureCsrfToken`: an endpoint
 * the API was given since it is checked as its call takes it.
 *
 * @param api - The API
 * @param where - Its name, for the errors
 * @returns What the server holds of the API's options
 * @throws ConfigurationError what `assertServerOptions` refuses options with
 * @example
 * ```ts
 * heldOptionsOf(api, "accounts").session?.csrf;
 * ```
 */
export function heldOptionsOf(api: AnySource, where: string): HeldOptions {
  const options: object = api.options ?? NO_OPTIONS;
  const taken = takenUp.get(options);
  return taken?.apis.has(api) === true ? taken : takeUp(api, options, where, undefined);
}

/**
 * What a server sends of an API's options on a call it lends the session:
 * what it holds of the options the call read, checked beside the options
 * of the call's endpoint — the same objects, never read again. Options it
 * holds nothing of — put in the place of those it took up, an endpoint's
 * new ones, those of an endpoint the API was given later — are checked and
 * held first, and refused as the first check refuses them. Options it took
 * up are not checked again: a call costs a server two lookups by the
 * objects.
 *
 * @param target - The call, as the session reads it
 * @returns What the server holds of the API's options; `undefined` for a call that names no API
 * @throws ConfigurationError what `assertServerOptions` refuses options with
 * @example
 * ```ts
 * const forward = heldForCall(target)?.forward;
 * ```
 */
export function heldForCall(target: SessionTarget): HeldOptions | undefined {
  if (target.api === undefined) return undefined;
  const api = target.api as AnySource;
  const options: object = target.options ?? NO_OPTIONS;
  const endpoint = target.endpoint ?? NO_OPTIONS;
  const taken = takenUp.get(options);
  if (taken?.endpoints.has(endpoint) === true) return taken;
  const where = getSourceName(api) ?? target.name.split(".")[0] ?? "api";
  return takeUp(api, options, where, [endpoint, target.name]);
}

/* What an API holds that no check read beside its options — the options, where the server took
   none of them up, each endpoint's not checked beside them, and the call's endpoint's — checked
   and, once all of it passes, held. */
function takeUp(
  api: AnySource,
  options: object,
  where: string,
  called: readonly [object, string] | undefined,
): TakenUp {
  const before = takenUp.get(options);
  const beside = endpointsBeside(api, where, before, called);
  if (before?.apis.has(api) === true && beside.size === 0) return before;
  const own = before === undefined ? readApiOptions(options, where) : [];
  const endpoints = [...beside].map(readEndpointOptions);
  const [session, forward, list] = own.map(({ copy }) => copy);
  assertSessionApi(before === undefined ? session : before.session, [
    ...(before === undefined ? [[where, list] as const] : []),
    ...endpoints.map(({ at, list: listed }) => [at, listed] as const),
  ] as ReadonlyArray<readonly [string, readonly string[] | undefined]>);
  for (const { agent } of endpoints) agentOptionsOf(agent as AgentMark | undefined);
  holdInPlace([...own, ...endpoints.flatMap(({ read }) => read)]);
  const taken: TakenUp = before ?? {
    options,
    session: session as SessionOptions | undefined,
    forward: forward as ForwardOptions | undefined,
    endpoints: new WeakSet(),
    apis: new WeakSet(),
  };
  for (const { owner, list: listed } of endpoints) {
    heldLists.set(owner, listed);
    taken.endpoints.add(owner);
  }
  taken.apis.add(api);
  takenUp.set(options, taken);
  return taken;
}

/* The API's session, `forward` and header list, read once and checked for what each is. */
function readApiOptions(options: object, where: string): ReadOption[] {
  const session = readOption(options, "session", "SESSION_OPTIONS_INVALID", "session", where);
  const forward = readOption(options, "forward", "FORWARD_OPTIONS_INVALID", "forward", where);
  const list = readOption(
    options,
    "allowedHeaders",
    "HEADER_LIST_INVALID",
    "allowedHeaders",
    where,
  );
  assertSessionOptions(session.copy, fieldOf(options, "baseURL") as string | undefined, where);
  assertForwardOptions(forward.copy, where);
  assertHeaderList(list);
  return [session, forward, list];
}

/* The options of each endpoint the API holds that were not checked beside its options, each once
   however many places hold it, and the call's endpoint's, by what a refusal names them. */
function endpointsBeside(
  api: AnySource,
  where: string,
  before: TakenUp | undefined,
  called: readonly [object, string] | undefined,
): Map<object, string> {
  const found = new Map<object, string>();
  const add = (owner: object, at: string) => {
    if (!found.has(owner) && before?.endpoints.has(owner) !== true) found.set(owner, at);
  };
  for (const { id, options } of eachEndpoint(api)) add(options, `${where}.${id}`);
  if (called !== undefined) add(...called);
  return found;
}

/* An endpoint's header list and how it is offered to agents, as a server holds them — read once,
   and the list checked for what it is, where it holds nothing of them yet. */
function readEndpointOptions([owner, at]: [object, string]): EndpointRead {
  if (heldLists.has(owner)) {
    return { owner, at, list: heldLists.get(owner), agent: undefined, read: [] };
  }
  const list = readOption(owner, "allowedHeaders", "HEADER_LIST_INVALID", ".headers()", at);
  const agent = readOption(owner, "agent", "AGENT_OPTIONS_INVALID", ".agent()", at);
  assertHeaderList(list);
  return { owner, at, list: list.copy, agent: agent.copy, read: [list, agent] };
}

/* A header list is data a server reads as written: a list of names, not a Set or a Map. */
function assertHeaderList({ copy, name, at }: ReadOption): void {
  if (copy === undefined) return;
  if (Array.isArray(copy) && copy.every((item: unknown) => typeof item === "string")) return;
  const given = Array.isArray(copy) ? "a list holding something other than a name" : describe(copy);
  throw new ConfigurationError(
    "HEADER_LIST_INVALID",
    `${at}: ${name} is a list of header names, such as ["x-api-version"], not ${given}`,
  );
}

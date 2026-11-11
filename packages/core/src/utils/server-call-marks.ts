import type { AgentCall } from "../agent/types";
import type { Context } from "../http-client/types";
import { isReactNative } from "./is-react-native";
import { REQUEST_MEMBERS } from "./request-members";

/* The marks of a server's call, under keys no code outside this module can name: only the
   server's own code marks a call, and no context a caller writes passes for one. A spread of
   the context carries them on with the rest of it. A module of its own, apart from the question
   whether a call is one user's: a page that makes only proxy calls asks that and takes none of
   these, whatever bundler builds it. */
const SERVER_CALL = Symbol("courier.serverCall");
const AGENT = Symbol("courier.agent");

/** A call's context, with the marks this module puts on it. */
type Marked = Context & {
  readonly [SERVER_CALL]?: true;
  readonly [AGENT]?: AgentCall;
};

/**
 * The context of a call the server's caller makes: a server's, made for
 * many users, so none is held for a newer call to cancel and none takes a
 * session a DOM on the server's global object keeps.
 *
 * @param context - The caller's own context
 * @returns The context, marked
 * @example
 * ```ts
 * directClient(source, { ...defaults, context: serverCallContext(defaults.context) });
 * ```
 */
export function serverCallContext(context: Context | undefined): Context {
  const marked: Marked = { ...context, [SERVER_CALL]: true };
  return marked;
}

/**
 * The context of a call an MCP server makes for an agent: the server's own,
 * which takes nothing of a request being served, nor of what a DOM on the
 * server's global object keeps, and which no newer call cancels. Its
 * middleware reads the agent in `ctx.agent`.
 *
 * @param context - The rest of the call's context
 * @param agent - The agent the call is made for
 * @returns The context, marked
 * @example
 * ```ts
 * await executeRequest(sources, call, agentCallContext({ defaultTimeout: 60_000 }, agent));
 * ```
 */
export function agentCallContext(context: Context | undefined, agent: AgentCall): Context {
  const marked: Marked = { ...context, [AGENT]: agent };
  return marked;
}

/**
 * The agent a call comes from, when an MCP server made it for one.
 *
 * @param context - The call's context
 * @returns The agent, or `undefined` for any other call
 * @example
 * ```ts
 * if (agentOf(context)) return undefined;
 * ```
 */
export function agentOf(context: Context | undefined): AgentCall | undefined {
  const marked: Marked | undefined = context;
  return marked?.[AGENT];
}

/**
 * Whether the server's caller made a call, or an MCP server made it for an
 * agent: a server's, whatever the platform it runs on.
 *
 * @param context - The call's context
 * @returns `true` for a call marked so
 * @example
 * ```ts
 * if (isServersCall(context)) return false;
 * ```
 */
export function isServersCall(context: Context | undefined): boolean {
  const marked: Marked | undefined = context;
  return marked?.[SERVER_CALL] === true || marked?.[AGENT] !== undefined;
}

/* What a server's call tells the platform's fetch: to send none of its own credentials. */
const SENDS_NONE: RequestInit = Object.freeze({ credentials: "omit" });

/**
 * What a call of the server's caller, or one an MCP server makes for an
 * agent, adds to its request's init: that the platform's fetch send none of
 * its own credentials, so no fetch that keeps a page's cookies — a DOM's on
 * the server, where a test runs a server's code under one — sends them for
 * a server's call. The call's own session, read of the request it serves,
 * it carries in its headers. Named where the core names the platform's
 * members, Node's, and where a DOM is on the global object; a platform
 * that refuses the member, Cloudflare's, has neither. React Native's
 * caller is the app's own.
 *
 * @param context - The call's context
 * @returns `{ credentials: "omit" }` for a server's call there, or `undefined`
 * @example
 * ```ts
 * coreFetch(method, url, { ...options, ...serversCallInit(context) });
 * ```
 */
export function serversCallInit(context: Context | undefined): RequestInit | undefined {
  if (!isServersCall(context) || isReactNative()) return undefined;
  const named = REQUEST_MEMBERS !== undefined || Object.hasOwn(globalThis, "document");
  return named ? SENDS_NONE : undefined;
}

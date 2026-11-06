import type { AgentCall } from "../agent/types";
import { serverCapability } from "../capabilities/registry";
import type { Context } from "../http-client/types";
import { namesRequest } from "../session/names-request";
import { isReactNative } from "./is-react-native";

/* The marks of a server's call, under keys no code outside this module can name: only the
   server's own code marks a call, and no context a caller writes passes for one. A spread of
   the context carries them on with the rest of it. */
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
 * Whether a call made now is one user's own, as every call of a browser or
 * an app is, so that a newer call may cancel an older one and the call may
 * carry the session the platform keeps. A call made while a request is
 * being served, naming one in its context, made by the server's caller, or
 * by an MCP server for an agent, is a server's, which serves many users —
 * one that put a DOM on its global object for a library among them. A React Native app is one user
 * whatever made the call: it takes this side of the module, and the root's
 * caller there is the server's. A page's bundle takes a stand-in that asks
 * none of it.
 *
 * @param context - The call's context
 * @returns `true` for a call in a page or an app with no request being served
 * @example
 * ```ts
 * const held = cancels && isOneUsersCall(context);
 * ```
 */
export function isOneUsersCall(context?: Context): boolean {
  if (context !== undefined && namesRequest(context)) return false;
  if (isReactNative()) return true;
  const marked: Marked | undefined = context;
  if (marked?.[SERVER_CALL] === true || marked?.[AGENT] !== undefined) return false;
  return (
    Reflect.get(globalThis, "document") !== undefined &&
    serverCapability("session")?.servesRequest() !== true
  );
}

import { serverCapability } from "../capabilities/registry";
import type { Context } from "../http-client/types";
import { namesRequest } from "../session/names-request";
import { isReactNative } from "./is-react-native";
import { isServersCall } from "./server-call-marks";

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
  if (isServersCall(context)) return false;
  return (
    Object.hasOwn(globalThis, "document") && serverCapability("session")?.servesRequest() !== true
  );
}

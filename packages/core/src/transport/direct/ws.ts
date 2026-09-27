import { getSourceName } from "../../define/api";
import type { AnyDefinedApi } from "../../define/types";
import { buildDirectWSUrl, buildWSTopic } from "../../realtime/caller-ws";
import { executeWSChannel } from "../../realtime/ws-channel-client";
import { executeWSPush } from "../../realtime/ws-subscription";
import { instrumentWSChannel, instrumentWSPush } from "../instrument";
import type { WSChannelFactory, WSPushFactory } from "../types";
import { addressCall } from "./address";

interface DirectWSContext {
  sourceName: string;
  baseURL: string;
  groups: Record<string, Record<string, unknown>> | undefined;
}

/**
 * Create a direct-mode bidirectional WS channel factory.
 *
 * URL pattern: `{baseURL with ws:// scheme}/{groupPrefix}/{path}`, where the
 * path is worked out from each call's variables.
 * Topic pattern: `{sourceName}.{group}.{method}` (multiplexed on shared connection)
 *
 * Browser-side studio instrumentation: when studio hooks are installed,
 * each channel emits stream:open / stream:message / stream:close / stream:error
 * with `mode: "direct"`.
 */
export function createDirectWSChannelFactory(api: AnyDefinedApi): WSChannelFactory {
  const ctx = readApiContext(api);

  return function connectChannel(group, method, variables) {
    /* The URL follows the path the closure addressed; the topic stays keyed
       on the endpoint's name, which is how the server resolves it, and the
       server validates the whole of the variables it is sent. */
    const url = urlOf(ctx, group, method, variables);
    const topic = buildWSTopic(ctx.sourceName, group, method);
    return instrumentWSChannel(executeWSChannel(url, topic, variables), {
      source: ctx.sourceName,
      group,
      method,
      transport: "ws",
      mode: "direct",
    });
  };
}

/**
 * Create a direct-mode server-push WS factory.
 *
 * URL pattern: same as the channel factory.
 * Topic pattern: same as the channel factory.
 *
 * Returns an `SSESubscription`-shaped iterable so push WS endpoints have
 * uniform consumer ergonomics with SSE endpoints.
 */
export function createDirectWSPushFactory(api: AnyDefinedApi): WSPushFactory {
  const ctx = readApiContext(api);

  return function connectPush(group, method, variables) {
    const url = urlOf(ctx, group, method, variables);
    const topic = buildWSTopic(ctx.sourceName, group, method);
    return instrumentWSPush(executeWSPush(url, topic, variables), {
      source: ctx.sourceName,
      group,
      method,
      transport: "ws",
      mode: "direct",
    });
  };
}

function readApiContext(api: AnyDefinedApi): DirectWSContext {
  const sourceName = getSourceName(api) ?? "_";
  const opts = (api as Record<string, unknown>).options as Record<string, unknown> | undefined;
  const baseURL = (opts?.baseURL as string | undefined) ?? "";
  const groups = opts?.groups as Record<string, Record<string, unknown>> | undefined;
  return { sourceName, baseURL, groups };
}

function prefixOf(
  groups: Record<string, Record<string, unknown>> | undefined,
  group: string,
): string {
  return (
    ((groups?.[group]?.options as Record<string, unknown> | undefined)?.prefix as string) ?? ""
  );
}

/** Where this call's connection goes, from the path the endpoint addressed. */
function urlOf(ctx: DirectWSContext, group: string, method: string, variables: unknown): string {
  const { path } = addressCall(ctx.groups?.[group]?.[method], method, variables);
  return buildDirectWSUrl(ctx.baseURL, prefixOf(ctx.groups, group), path);
}

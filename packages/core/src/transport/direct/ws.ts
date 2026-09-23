import { endpointPath } from "../../define/address";
import { getSourceName } from "../../define/api";
import type { DefinedApi, DefinedFlatApi, DefinedMixedApi } from "../../define/types";
import { buildDirectWSUrl, buildWSTopic } from "../../realtime/caller-ws";
import { executeWSChannel } from "../../realtime/ws-channel-client";
import { executeWSPush } from "../../realtime/ws-subscription";
import { instrumentWSChannel, instrumentWSPush } from "../instrument";
import type { WSChannelFactory, WSPushFactory } from "../types";

type AnyDefinedApi = DefinedApi | DefinedFlatApi | DefinedMixedApi;

interface DirectWSContext {
  sourceName: string;
  baseURL: string;
  groups: Record<string, Record<string, unknown>> | undefined;
}

/**
 * Create a direct-mode bidirectional WS channel factory.
 *
 * URL pattern: `{baseURL with ws:// scheme}/{groupPrefix}/{method}`
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
       on the endpoint's name, which is how the server resolves it. */
    const url = buildDirectWSUrl(
      ctx.baseURL,
      prefixOf(ctx.groups, group),
      pathOf(ctx.groups, group, method),
    );
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
    const url = buildDirectWSUrl(
      ctx.baseURL,
      prefixOf(ctx.groups, group),
      pathOf(ctx.groups, group, method),
    );
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

/** Where the endpoint's closure addressed, falling back to its name. */
function pathOf(
  groups: Record<string, Record<string, unknown>> | undefined,
  group: string,
  method: string,
): string {
  return endpointPath(groups?.[group]?.[method], method);
}

import { unqualifyTopic } from "../realtime/ws/topic-hash";
import type { WSMessage } from "../realtime/ws/ws-protocol";
import { resolveEndpoint } from "../utils/execute-resolve";
import type { WSSocketContext } from "./ws-context";

/** Parse "source.group.method" or "source.group.method#hash" topic format */
export function parseTopic(topic: string): { source?: string; group?: string; method: string } {
  const { baseTopic } = unqualifyTopic(topic);
  const [first, second, third] = baseTopic.split(".");
  if (third !== undefined) return { source: first, group: second, method: third };
  if (second !== undefined) return { source: first, group: undefined, method: second };
  return { method: first ?? baseTopic };
}

/** Resolve topic → source + endpoint, sending errors on failure */
export function resolveSubscribeTopic(
  ctx: WSSocketContext,
  msg: WSMessage,
  topic: string,
):
  | {
      source: string;
      group?: string;
      method: string;
      endpoint: unknown;
      schema: Record<string, unknown>;
    }
  | undefined {
  const { source, group, method } = parseTopic(topic);
  if (!source) {
    ctx.sendMessage({
      type: "error",
      id: msg.id,
      error: { code: 4400, message: "Topic must include source name" },
    });
    return undefined;
  }

  const dataSource = ctx.sources[source];
  if (!dataSource) {
    ctx.sendMessage({
      type: "error",
      id: msg.id,
      error: { code: 4403, message: "Subscription rejected" },
    });
    return undefined;
  }

  const { endpoint, schema } = resolveEndpoint(
    dataSource as Record<string, unknown>,
    group,
    method,
  );
  if (typeof endpoint !== "function" || schema?.transport !== "ws") {
    ctx.sendMessage({
      type: "error",
      id: msg.id,
      error: { code: 4403, message: "Subscription rejected" },
    });
    return undefined;
  }

  return { source, group, method, endpoint, schema: schema as Record<string, unknown> };
}

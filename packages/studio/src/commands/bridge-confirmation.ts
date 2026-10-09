import {
  CONFIRM_INPUT,
  canAsk,
  isLegacyVersion,
  META,
  MODERN_VERSIONS,
} from "@noverax/courier-mcp/internal";

import type { ClientAsks } from "./client-asks";

type Message = Record<string, unknown>;

/** What the bridge learned of its client from `initialize`. */
export interface BridgedClient {
  /** The revision `initialize` settled. */
  version?: string | undefined;
  capabilities?: Record<string, unknown> | undefined;
  /** The client as it named itself. */
  info?: Record<string, unknown> | undefined;
}

/* The questions one call may go through before the bridge stops asking. */
const MOST_ROUNDS = 3;

/**
 * Whether a message is a tool call the bridge sees through itself: one from
 * a client on the 2025 handshake that can put a question to its person.
 * Studio answers over HTTP, one request at a time, so it cannot ask that
 * client anything itself; the bridge can, over the client's own connection.
 *
 * @param message - The client's message
 * @param client - What `initialize` told the bridge of the client
 * @returns Whether the bridge carries the call's confirmation
 * @example
 * ```ts
 * if (confirmsThroughBridge(message, client)) return callConfirming(message, client, asks, post);
 * ```
 */
export function confirmsThroughBridge(
  message: Message | undefined,
  client: BridgedClient,
): boolean {
  return (
    message?.method === "tools/call" &&
    isLegacyVersion(client.version) &&
    canAsk(client.capabilities)
  );
}

/**
 * Make a tool call as 2026-07-28 makes it — naming the revision, the client
 * and what it can do in the call itself — so that Studio answers a write
 * with the question its person is to confirm. The bridge asks the client,
 * as a server on the 2025 handshake asks, calls again with the answer and
 * the state Studio gave, and hands back the final answer in the client's
 * own revision.
 *
 * @param message - The client's `tools/call`
 * @param client - What `initialize` told the bridge of the client
 * @param asks - Puts the question to the client
 * @param post - Sends a message to Studio, and reads its answer
 * @returns The answer for the client, or `undefined` when Studio sent none
 * @example
 * ```ts
 * const answer = await callConfirming(message, client, asks, post);
 * ```
 */
export async function callConfirming(
  message: Message,
  client: BridgedClient,
  asks: ClientAsks,
  post: (message: Message) => Promise<Message | undefined>,
): Promise<Message | undefined> {
  const params = isRecord(message.params) ? message.params : {};
  const call = { ...message, params: { ...params, _meta: modernMeta(params, client) } };
  let answer = await post(call);
  for (let round = 0; round < MOST_ROUNDS; round++) {
    const asked = questionIn(answer);
    if (asked === undefined) return answer && legacyAnswer(answer);
    const reply = await asks.ask("elicitation/create", legacyQuestion(asked.question, client));
    answer = await post({
      ...call,
      params: {
        ...call.params,
        inputResponses: { [CONFIRM_INPUT]: reply ?? { action: "cancel" } },
        requestState: asked.state,
      },
    });
  }
  return questionIn(answer) === undefined
    ? answer && legacyAnswer(answer)
    : { jsonrpc: "2.0", id: message.id, result: stopped() };
}

function modernMeta(params: Message, client: BridgedClient): Message {
  return {
    ...(isRecord(params._meta) ? params._meta : {}),
    [META.protocolVersion]: MODERN_VERSIONS[0],
    [META.clientCapabilities]: client.capabilities ?? {},
    ...(client.info !== undefined && { [META.clientInfo]: client.info }),
  };
}

/* The confirmation in an answer that asks for one, and the state the call goes again with. */
function questionIn(
  answer: Message | undefined,
): { question: Message; state: unknown } | undefined {
  const result = isRecord(answer?.result) ? answer.result : undefined;
  if (result?.resultType !== "input_required") return undefined;
  const requests = isRecord(result.inputRequests) ? result.inputRequests : {};
  const asked = requests[CONFIRM_INPUT];
  if (!isRecord(asked) || !isRecord(asked.params)) return undefined;
  return { question: asked.params, state: result.requestState };
}

/* A form's mode is named from 2025-11-25 on; a client before it is not sent a field it does not know. */
function legacyQuestion(question: Message, client: BridgedClient): Message {
  if (client.version === "2025-11-25") return question;
  const { mode: _mode, ...rest } = question;
  return rest;
}

/* What 2026-07-28 adds to a result, which a client on the 2025 handshake does not read. */
function legacyAnswer(answer: Message): Message {
  if (!isRecord(answer.result)) return answer;
  const { resultType: _type, _meta, ...result } = answer.result;
  const meta = isRecord(_meta) ? withoutServerInfo(_meta) : {};
  return { ...answer, result: Object.keys(meta).length > 0 ? { ...result, _meta: meta } : result };
}

function withoutServerInfo(meta: Message): Message {
  const { [META.serverInfo]: _info, ...rest } = meta;
  return rest;
}

function stopped(): Message {
  const text = "Not run: Studio asked more questions about this call than one call takes.";
  return { content: [{ type: "text", text }], isError: true };
}

function isRecord(value: unknown): value is Message {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

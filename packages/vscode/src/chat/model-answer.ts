import * as vscode from "vscode";

import { rangeOf } from "../code/ranges";
import type { EndpointStats } from "../studio/studio-types";
import { auditFacts, endpointFacts, failureFacts, statusFacts } from "./chat-facts";
import type { ChatAsk } from "./chat-types";

const GROUNDING = [
  "You answer questions about the user's app and the API it calls, in the editor, for Courier.",
  "Courier Studio recorded every call the app made in this session, audited the calls, and runs the API's mocks.",
  "Answer from the facts below alone, naming endpoints as `source.group.endpoint`.",
  "Where the facts do not hold the answer, say so, and say what to open in Studio to find it. Be brief.",
].join(" ");

/* The endpoints a question names whose latest calls go with the facts, and the earlier turns kept. */
const MOST_NAMED = 3;
const MOST_TURNS = 6;

/**
 * Answer a question in words: the model — the one picked in the chat, or
 * the first the editor offers — answers from Studio's facts: how the
 * endpoints are doing, the latest failures, the audit's findings, and the
 * latest calls of each endpoint the question names, whose declarations it
 * links. With no model to ask, or one that refuses, the facts are the answer.
 *
 * @param ask - The request and what answers it
 * @example
 * ```ts
 * await modelAnswer(ask);
 * ```
 */
export async function modelAnswer(ask: ChatAsk): Promise<void> {
  const { deps, request, context, stream, token } = ask;
  const facts = await factsFor(ask);
  const model = request.model ?? (await deps.model());
  if (!model) {
    stream.markdown(
      `No language model answers in this editor; here is what Studio knows.\n\n${facts}`,
    );
    return;
  }
  const messages = [
    vscode.LanguageModelChatMessage.User(`${GROUNDING}\n\n${facts}`),
    ...earlierTurns(context),
    vscode.LanguageModelChatMessage.User(request.prompt),
  ];
  try {
    const reply = await model.sendRequest(messages, {}, token);
    for await (const fragment of reply.text) stream.markdown(fragment);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    stream.markdown(
      `\n\nThe model did not answer (${why}); here is what Studio knows.\n\n${facts}`,
    );
  }
}

async function factsFor(ask: ChatAsk): Promise<string> {
  const { deps, studio, stats, request, stream, now } = ask;
  const [failures, findings] = await Promise.all([
    deps.fetchRequests(studio, { failed: true, limit: 20 }),
    deps.fetchFindings(studio),
  ]);
  const parts = [
    statusFacts(stats, now),
    `Latest failures:\n${failureFacts(failures, now)}`,
    `Audit:\n${auditFacts(findings)}`,
  ];
  const named = namedInQuestion(stats, request.prompt).slice(0, MOST_NAMED);
  const declared = named.length > 0 ? await deps.definitionsFor(studio) : [];
  for (const each of named) {
    const { source, endpoint } = each;
    const requests = await deps.fetchRequests(studio, { source, endpoint, limit: 10 });
    parts.push(endpointFacts(each, requests, now));
    const place = declared.find((one) => one.source === source && one.endpoint === endpoint);
    if (!place) continue;
    parts.push(`\`${source}.${endpoint}\` is declared in ${place.file}, line ${place.line}.`);
    stream.reference(new vscode.Location(vscode.Uri.file(place.path), rangeOf(place.span)));
  }
  return parts.join("\n\n");
}

/* The endpoints a question names, by their whole names: `orders.place`, or `shop.orders.place`. */
function namedInQuestion(stats: readonly EndpointStats[], question: string): EndpointStats[] {
  return stats.filter((each) =>
    [`${each.source}.${each.endpoint}`, each.endpoint].some((name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^\\w.])${escaped}(?![\\w])`).test(question);
    }),
  );
}

/* The earlier turns of the chat with @courier, so that a question may follow on from an answer. */
function earlierTurns(context: vscode.ChatContext): vscode.LanguageModelChatMessage[] {
  return context.history.slice(-MOST_TURNS).flatMap((turn) => {
    if ("prompt" in turn) return [vscode.LanguageModelChatMessage.User(turn.prompt)];
    const text = turn.response
      .map((part) => (part instanceof vscode.ChatResponseMarkdownPart ? part.value.value : ""))
      .join("");
    return text ? [vscode.LanguageModelChatMessage.Assistant(text)] : [];
  });
}

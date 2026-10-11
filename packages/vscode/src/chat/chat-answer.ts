import type * as vscode from "vscode";

import type { EndpointStats } from "../studio/studio-types";
import type { ChatAsk, ChatDeps, ChatTurn } from "./chat-types";
import { auditAnswer, endpointAnswer, failuresAnswer, statusAnswer } from "./command-answers";
import { modelAnswer } from "./model-answer";

const COMMANDS = new Map<string, (ask: ChatAsk) => Promise<void>>([
  ["status", statusAnswer],
  ["failures", failuresAnswer],
  ["audit", auditAnswer],
  ["endpoint", endpointAnswer],
]);

/**
 * Answer a request to @courier: `/status`, `/failures`, `/audit` and
 * `/endpoint` from Studio's own figures — with buttons into Studio and
 * links to the places in the code — and any other question in words, by
 * the model, from those figures. The Studio asked is the one of the file
 * in front, or the only one the workspace runs.
 *
 * @param deps - What answers are read from
 * @param turn - The request, as the chat hands it over
 * @returns The result, naming the command answered for the follow-ups
 * @example
 * ```ts
 * vscode.chat.createChatParticipant(PARTICIPANT, (request, context, stream, token) =>
 *   answer(deps, { request, context, stream, token }),
 * );
 * ```
 */
export async function answer(deps: ChatDeps, turn: ChatTurn): Promise<vscode.ChatResult> {
  const { request, stream } = turn;
  const result = { metadata: { command: request.command ?? "ask" } };
  const studios = await deps.studios();
  const [studio] = studios;
  if (!studio || studios.length > 1) {
    stream.markdown(
      studio
        ? "Several projects of this workspace run Courier Studio: open a file of the one you mean, and ask again."
        : "Courier Studio is not running for this workspace: start it, and ask again.",
    );
    if (!studio) stream.button({ command: "courier.startStudio", title: "Start Studio" });
    return result;
  }
  try {
    const stats: readonly EndpointStats[] = await deps.fetchStats(studio);
    const run = (request.command && COMMANDS.get(request.command)) || modelAnswer;
    await run({ ...turn, deps, studio, stats, now: Date.now() });
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    stream.markdown(`\n\nCourier Studio at ${studio} did not answer: ${why}`);
  }
  return result;
}

import * as vscode from "vscode";

import { endpointAt, endpointsNamed } from "../code/endpoint-at";
import type { CourierCore } from "../core/courier-core";
import { fetchEndpointStats, fetchFindings, fetchSites } from "../studio/studio-api";
import { studiosAtHand } from "../studio/studio-at-hand";
import { fetchRequests } from "../studio/studio-live-api";
import type { EndpointName } from "../studio/studio-types";
import { answer } from "./chat-answer";
import { followups } from "./chat-followups";
import type { ChatDeps } from "./chat-types";

/** The chat participant's id, as `contributes.chatParticipants` declares it. */
export const PARTICIPANT = "noverax.courier";

/**
 * Courier in the editor's chat: `@courier` answers `/status`, `/failures`,
 * `/audit` and `/endpoint` from the Studio of the file in front, and any
 * other question in words, by the model picked in the chat, from Studio's
 * figures. An editor without a chat leaves it out.
 *
 * @param core - The extension's core
 * @returns What removes it
 * @example
 * ```ts
 * context.subscriptions.push(registerChat(core));
 * ```
 */
export function registerChat(core: CourierCore): vscode.Disposable {
  if (typeof vscode.chat?.createChatParticipant !== "function") return vscode.Disposable.from();
  const deps: ChatDeps = {
    studios: () => studiosAtHand(core.studioFor, core.view.targets),
    endpointInFront: () => endpointInFront(core),
    fetchStats: fetchEndpointStats,
    fetchRequests,
    fetchFindings,
    definitionsFor: (studio) => core.definitions.definitionsFor(studio),
    fetchSites,
    model: async () => (await vscode.lm.selectChatModels())[0],
  };
  const participant = vscode.chat.createChatParticipant(
    PARTICIPANT,
    (request, context, stream, token) => answer(deps, { request, context, stream, token }),
  );
  participant.iconPath = vscode.Uri.joinPath(core.context.extensionUri, "media", "icon.png");
  participant.followupProvider = followups;
  return participant;
}

async function endpointInFront(core: CourierCore): Promise<EndpointName | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;
  const at = await endpointAt(
    core.store,
    core.definitions,
    editor.document,
    editor.selection.active,
  );
  return at && endpointsNamed(at)[0];
}

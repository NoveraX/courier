/**
 * @courier in the editor's chat: registered under the id the manifest
 * declares, with the extension's icon and its follow-ups — the failures
 * after the status, why they fail after the failures — and left out of an
 * editor without a chat.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import type * as vscode from "vscode";

import { followups } from "../src/chat/chat-followups";
import { PARTICIPANT, registerChat } from "../src/chat/register-chat";
import type { CourierCore } from "../src/core/courier-core";
import { chat, Uri } from "./vscode-stand-in";

const core = { context: { extensionUri: Uri.file("/extension") } } as unknown as CourierCore;
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  contributes: { chatParticipants: { id: string; name: string; commands: { name: string }[] }[] };
};

afterEach(() => {
  chat.createChatParticipant = undefined;
});

describe("@courier's registration", () => {
  it("creates the participant the manifest declares, with its icon and follow-ups", () => {
    const created: { id: string; participant: Record<string, unknown> }[] = [];
    chat.createChatParticipant = (id) => {
      const participant = { dispose: () => undefined };
      created.push({ id, participant });
      return participant;
    };

    registerChat(core);

    const [declared] = manifest.contributes.chatParticipants;
    expect(created.map((each) => each.id)).toEqual([PARTICIPANT]);
    expect(declared?.id).toBe(PARTICIPANT);
    expect(declared?.name).toBe("courier");
    expect(declared?.commands.map((each) => each.name)).toEqual([
      "status",
      "failures",
      "audit",
      "endpoint",
    ]);
    expect(String(created[0]?.participant.iconPath)).toBe("file:///extension/media/icon.png");
    expect(created[0]?.participant.followupProvider).toBe(followups);
  });

  it("is left out of an editor without a chat", () => {
    expect(() => registerChat(core).dispose()).not.toThrow();
  });
});

describe("what @courier offers to ask next", () => {
  const next = (command?: string) =>
    followups.provideFollowups(
      { metadata: { command } },
      {} as vscode.ChatContext,
      {} as vscode.CancellationToken,
    ) as vscode.ChatFollowup[];

  it("offers the failures and the audit after the status, and why they fail after the failures", () => {
    expect(next("status").map((each) => each.command)).toEqual(["failures", "audit"]);
    expect(next("failures").map((each) => each.label)).toEqual([
      "Why do they fail?",
      "What the audit found",
    ]);
  });

  it("offers nothing after an answer it does not know", () => {
    expect(next()).toEqual([]);
    expect(next("unknown")).toEqual([]);
  });
});

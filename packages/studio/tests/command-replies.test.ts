import { describe, expect, it } from "vitest";

import { createCommandReplies } from "../src/server/mock-manager/command-replies";

describe("createCommandReplies", () => {
  it("answers a command with what the mock answered it with", async () => {
    const replies = createCommandReplies();
    const { requestId, reply } = replies.expect();

    replies.settle({ type: "command-result", requestId, ok: true, data: "[1,2,3]" });

    expect(await reply).toEqual({ ok: true, data: "[1,2,3]" });
  });

  it("answers a command the mock ran with no data as run", async () => {
    const replies = createCommandReplies();
    const { requestId, reply } = replies.expect();

    replies.settle({ type: "command-result", requestId, ok: true });

    expect(await reply).toEqual({ ok: true });
  });

  it("says why a command was not run, and nothing more", async () => {
    const replies = createCommandReplies();
    const { requestId, reply } = replies.expect();

    replies.settle({ type: "command-result", requestId, ok: false, error: "gone", data: 1 });

    expect(await reply).toEqual({ ok: false, error: "gone" });
  });

  it("answers every command still waiting when the worker will not", async () => {
    const replies = createCommandReplies();
    const first = replies.expect();
    const second = replies.expect();

    replies.failAll("The mock stopped.");

    expect(await Promise.all([first.reply, second.reply])).toEqual([
      { ok: false, error: "The mock stopped." },
      { ok: false, error: "The mock stopped." },
    ]);
  });
});

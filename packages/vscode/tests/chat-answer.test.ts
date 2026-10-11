/**
 * How @courier answers: each command from the Studio of the file in front —
 * or the only one running — with buttons into Studio and links to the
 * code; any other question by the model picked in the chat, from Studio's
 * facts and the chat's earlier turns, the facts alone when no model
 * answers; and a Studio that is not running, or not alone, or does not
 * answer, said so.
 */

import { describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";

import { answer } from "../src/chat/chat-answer";
import type { ChatDeps } from "../src/chat/chat-types";
import type { RecordedRequest } from "../src/studio/live-types";
import type { EndpointStats } from "../src/studio/studio-types";
import { ChatResponseMarkdownPart, MarkdownString } from "./vscode-stand-in";

const STUDIO = "http://localhost:6280";
const PLACE: EndpointStats = {
  source: "shop",
  endpoint: "orders.place",
  calls: 4,
  failed: 1,
  pending: 0,
  statuses: { "201": 3, "500": 1 },
  p95: 40,
  lastFailure: { at: Date.now(), message: "Ledger unavailable", request: "r2" },
};
const FAILED: RecordedRequest = {
  id: "r2",
  source: "shop",
  endpoint: "orders.place",
  method: "POST",
  mode: "proxy",
  state: "error",
  status: 500,
  startedAt: Date.now(),
  error: "Ledger unavailable",
};
const DECLARED = {
  source: "shop",
  endpoint: "orders.place",
  file: "src/api/orders.ts",
  path: "/work/shop/src/api/orders.ts",
  line: 12,
  column: 3,
  endLine: 12,
  endColumn: 8,
  span: { line: 12, column: 3, endLine: 14, endColumn: 4 },
};
const SITE = {
  path: "/work/shop/src/checkout.ts",
  line: 30,
  column: 9,
  endLine: 30,
  endColumn: 29,
};

function depsWith(change: Partial<ChatDeps> = {}): ChatDeps {
  return {
    studios: async () => [STUDIO],
    endpointInFront: async () => undefined,
    fetchStats: async () => [PLACE],
    fetchRequests: vi.fn(async () => [FAILED]),
    fetchFindings: async () => [],
    definitionsFor: async () => [DECLARED],
    fetchSites: async () => [SITE] as never,
    model: async () => undefined,
    ...change,
  };
}

function turnOf(prompt: string, command?: string, history: unknown[] = [], model?: unknown) {
  const said: string[] = [];
  const buttons: { command: string; title: string; arguments?: unknown[] }[] = [];
  const references: { uri: { fsPath: string } }[] = [];
  const stream = {
    markdown: (text: string) => said.push(text),
    button: (button: (typeof buttons)[number]) => buttons.push(button),
    reference: (where: (typeof references)[number]) => references.push(where),
  };
  const turn = {
    request: { prompt, command, model } as unknown as vscode.ChatRequest,
    context: { history } as unknown as vscode.ChatContext,
    stream: stream as unknown as vscode.ChatResponseStream,
    token: {} as vscode.CancellationToken,
  };
  return { turn, text: () => said.join(""), buttons, references };
}

describe("@courier's commands", () => {
  it("answers /status with every endpoint's figures, and a button to Studio", async () => {
    const { turn, text, buttons } = turnOf("", "status");

    const result = await answer(depsWith(), turn);

    expect(text()).toContain("`shop.orders.place`");
    expect(buttons).toEqual([
      { command: "courier.openStudioPage", arguments: [STUDIO], title: "Open Studio" },
    ]);
    expect(result.metadata).toEqual({ command: "status" });
  });

  it("answers /failures with the failed requests, the latest a click away", async () => {
    const deps = depsWith();
    const { turn, text, buttons } = turnOf("", "failures");

    await answer(deps, turn);

    expect(deps.fetchRequests).toHaveBeenCalledWith(STUDIO, { failed: true, limit: 20 });
    expect(text()).toContain("POST → 500");
    expect(buttons.map((each) => each.command)).toEqual([
      "courier.openStudioPage",
      "courier.requests.showFailed",
    ]);
    expect(buttons[0]?.arguments).toEqual([`${STUDIO}/timeline?req=r2`]);
  });

  it("answers /endpoint with the endpoint named, linked to its declaration and callers", async () => {
    const { turn, text, buttons, references } = turnOf(" `orders.place` ", "endpoint");

    await answer(depsWith(), turn);

    expect(text()).toContain("**`shop.orders.place`**");
    expect(references.map((each) => each.uri.fsPath)).toEqual([DECLARED.path, SITE.path]);
    expect(buttons[0]?.arguments).toEqual([
      `${STUDIO}/explorer/endpoints?endpoint=shop.orders.place`,
    ]);
  });

  it("takes the endpoint under the cursor when /endpoint names none, and says when it knows none", async () => {
    const inFront = turnOf("", "endpoint");
    const unknown = turnOf("orders.refund", "endpoint");

    await answer(
      depsWith({ endpointInFront: async () => ({ source: "shop", endpoint: "orders.place" }) }),
      inFront.turn,
    );
    await answer(depsWith(), unknown.turn);

    expect(inFront.text()).toContain("**`shop.orders.place`**");
    expect(unknown.text()).toContain("No endpoint is called `orders.refund`");
  });
});

describe("@courier's answers in words", () => {
  it("asks the chat's model with Studio's facts, the earlier turns and the question", async () => {
    const asked: { role: string; content: string }[][] = [];
    const model = {
      sendRequest: async (messages: { role: string; content: string }[]) => {
        asked.push(messages);
        return {
          text: (async function* () {
            yield "It fails ";
            yield "on the ledger.";
          })(),
        };
      },
    };
    const history = [
      { prompt: "how is checkout?", participant: "noverax.courier" },
      { response: [new ChatResponseMarkdownPart(new MarkdownString("One endpoint fails."))] },
    ];
    const { turn, text, references } = turnOf(
      "Why does orders.place fail?",
      undefined,
      history,
      model,
    );

    const result = await answer(depsWith(), turn);

    const [messages = []] = asked;
    expect(messages.map((each) => each.role)).toEqual(["user", "user", "assistant", "user"]);
    expect(messages[0]?.content).toContain("Latest failures:");
    expect(messages[0]?.content).toContain(
      "`shop.orders.place` is declared in src/api/orders.ts, line 12.",
    );
    expect(messages[2]?.content).toBe("One endpoint fails.");
    expect(messages[3]?.content).toBe("Why does orders.place fail?");
    expect(text()).toBe("It fails on the ledger.");
    expect(references.map((each) => each.uri.fsPath)).toEqual([DECLARED.path]);
    expect(result.metadata).toEqual({ command: "ask" });
  });

  it("gives the facts when no model answers, and when the model refuses", async () => {
    const none = turnOf("What fails?");
    const refusing = turnOf("What fails?", undefined, [], {
      sendRequest: async () => {
        throw new Error("No access to the model");
      },
    });

    await answer(depsWith(), none.turn);
    await answer(depsWith(), refusing.turn);

    expect(none.text()).toMatch(
      /^No language model answers in this editor; here is what Studio knows\./,
    );
    expect(refusing.text()).toContain("The model did not answer (No access to the model)");
    expect(refusing.text()).toContain("Latest failures:");
  });
});

describe("@courier without its Studio", () => {
  it("offers to start Studio when none runs, and asks which project when several do", async () => {
    const none = turnOf("", "status");
    const several = turnOf("", "status");

    await answer(depsWith({ studios: async () => [] }), none.turn);
    await answer(
      depsWith({ studios: async () => [STUDIO, "http://localhost:6281"] }),
      several.turn,
    );

    expect(none.text()).toContain("not running");
    expect(none.buttons).toEqual([{ command: "courier.startStudio", title: "Start Studio" }]);
    expect(several.text()).toContain("open a file of the one you mean");
    expect(several.buttons).toEqual([]);
  });

  it("says so when Studio does not answer", async () => {
    const { turn, text } = turnOf("", "audit");

    await answer(
      depsWith({ fetchStats: async () => Promise.reject(new Error("fetch failed")) }),
      turn,
    );

    expect(text()).toContain(`Courier Studio at ${STUDIO} did not answer: fetch failed`);
  });
});

import { describe, expect, it } from "vitest";

import { confirmationParams, notRun, shownCall } from "../../src/protocol/confirmation";
import type { ServedTool } from "../../src/protocol/served-tool";

function tool(overrides: Partial<ServedTool> = {}): ServedTool {
  return {
    name: "orders_cancel",
    description: "Cancel an order",
    access: "destructive",
    inputSchema: { type: "object" },
    idempotent: false,
    action: "POST shop.orders.cancel",
    run: async () => ({ ok: true, data: null }),
    ...overrides,
  };
}

describe("the call a person is asked to confirm", () => {
  it("is the tool's action with the arguments it was given", async () => {
    expect(await shownCall(tool(), { id: "7" })).toBe('POST shop.orders.cancel with {"id":"7"}');
  });

  it("cuts arguments that run long", async () => {
    const shown = await shownCall(tool(), { note: "x".repeat(2_000) });

    expect(shown.length).toBeLessThan(700);
    expect(shown.endsWith("…")).toBe(true);
  });

  it("is the tool's own account of it when its arguments decide what it does", async () => {
    const replay = tool({
      name: "replay_write",
      action: "replay a recorded write",
      confirming: async (args) =>
        `POST shop.orders.create again, as request ${String(args.id)} made it`,
    });

    const question = confirmationParams(replay, await shownCall(replay, { id: "req_1" }), true);

    expect(question.message).toContain("POST shop.orders.create again, as request req_1 made it");
    expect(question.message).not.toContain("replay a recorded write with");
    expect(question).toMatchObject({ mode: "form", requestedSchema: { type: "object" } });
  });
});

describe("why a destructive call did not run", () => {
  it("says how the operator lifts the rule, by what the server runs over", () => {
    expect(notRun(tool(), "unasked", { transport: "stdio" })).toContain(
      "start the server with --allow-destructive",
    );
    expect(notRun(tool(), "unasked", { transport: "http" })).toContain(
      "set the handler's allowDestructive",
    );
  });

  it("says what to do instead when the server says so itself", () => {
    const message = notRun(tool(), "unasked", {
      transport: "http",
      unasked: "replay it from Studio's inspector",
    });

    expect(message).toContain(
      "Use a client that supports MCP elicitation, or replay it from Studio's inspector.",
    );
    expect(message).not.toContain("allowDestructive");
  });

  it("names what the person did", () => {
    expect(notRun(tool(), "decline", { transport: "http" })).toBe(
      "Not run: the person declined orders_cancel.",
    );
  });
});

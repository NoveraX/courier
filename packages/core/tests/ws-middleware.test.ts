import { describe, expect, it } from "vitest";
import type { WSSocketContext } from "../src/adapter/ws-context";
import { VALIDATION_FAILED, validateVariablesSafe } from "../src/adapter/ws-middleware";
import type { WSMessage } from "../src/realtime/ws/ws-protocol";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockCtx(overrides: Partial<WSSocketContext> = {}): {
  ctx: WSSocketContext;
  sent: WSMessage[];
} {
  const sent: WSMessage[] = [];
  const ctx = {
    connectionId: "conn-1",
    requestId: "req-1",
    sources: {},
    sendMessage: (msg: WSMessage) => sent.push(msg),
    request: new Request("http://localhost/ws"),
    middlewareTimeoutMs: 30000,
    ...overrides,
  } as unknown as WSSocketContext;
  return { ctx, sent };
}

// ---------------------------------------------------------------------------
// validateVariablesSafe
// ---------------------------------------------------------------------------

describe("validateVariablesSafe", () => {
  it("returns payload when schema has no variables", async () => {
    const { ctx } = createMockCtx();
    const msg: WSMessage = { type: "subscribe", id: "1", payload: { name: "test" } };
    const schema = {};

    const result = await validateVariablesSafe(ctx, msg, schema);

    expect(result).toEqual({ name: "test" });
  });

  it("returns validated value on success", async () => {
    const { ctx, sent } = createMockCtx();
    const msg: WSMessage = { type: "subscribe", id: "2", payload: { id: 42 } };
    const schema = {
      variables: {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (v: unknown) => ({ value: v }),
        },
      },
    };

    const result = await validateVariablesSafe(ctx, msg, schema);

    expect(result).toEqual({ id: 42 });
    expect(sent).toHaveLength(0);
  });

  it("returns VALIDATION_FAILED and sends error on validation failure", async () => {
    const { ctx, sent } = createMockCtx();
    const msg: WSMessage = { type: "subscribe", id: "3", payload: "bad" };
    const schema = {
      variables: {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: () => ({ issues: [{ message: "invalid" }] }),
        },
      },
    };

    const result = await validateVariablesSafe(ctx, msg, schema);

    expect(result).toBe(VALIDATION_FAILED);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.error?.code).toBe(4422);
    expect(sent[0]!.error?.message).toBe("Invalid variables");
    expect(sent[0]!.id).toBe("3");
  });

  it("VALIDATION_FAILED is a unique symbol", () => {
    expect(typeof VALIDATION_FAILED).toBe("symbol");
    expect(VALIDATION_FAILED).not.toBe(Symbol("validation_failed"));
  });
});

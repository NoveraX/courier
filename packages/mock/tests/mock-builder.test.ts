import { describe, expect, it } from "vitest";
import { createEnhancedMockBuilder } from "../src/builder";
import type { ResolvedHandler } from "../src/types";

function buildAndCapture() {
  let captured: ResolvedHandler | undefined;
  const builder = createEnhancedMockBuilder<string, { id: string }>((handler) => {
    captured = handler;
  });
  return { builder, getHandler: () => captured! };
}

describe("EnhancedMockBuilder", () => {
  it("resolves with static data", () => {
    const { builder, getHandler } = buildAndCapture();
    builder.resolves("hello");

    expect(getHandler().fn({} as never)).toBe("hello");
    expect(getHandler().isError).toBe(false);
  });

  it("returns dynamic data via handler function", () => {
    const { builder, getHandler } = buildAndCapture();
    builder.returns((ctx) => `user-${ctx.variables.id}`);

    const ctx = { variables: { id: "42" }, headers: new Headers(), callIndex: 0, scenarioState: "Started" };
    expect(getHandler().fn(ctx)).toBe("user-42");
  });

  it("rejects with error status", () => {
    const { builder, getHandler } = buildAndCapture();
    builder.rejects(404);

    expect(getHandler().isError).toBe(true);
    expect(getHandler().status).toBe(404);
  });

  it("sets remaining count with once()", () => {
    const { builder, getHandler } = buildAndCapture();
    builder.resolves("data").once();
    expect(getHandler().remaining).toBe(1);
  });

  it("sets remaining count with times(n)", () => {
    const { builder, getHandler } = buildAndCapture();
    builder.resolves("data").times(3);
    expect(getHandler().remaining).toBe(3);
  });

  it("sets delay in ms", () => {
    const { builder, getHandler } = buildAndCapture();
    builder.resolves("data").delay(100);
    expect(getHandler().delayMs).toBe(100);
  });

  it("sets latency profile", () => {
    const { builder, getHandler } = buildAndCapture();
    builder.resolves("data").withLatency("3g");
    expect(getHandler().latency).toBe("3g");
  });

  it("sets custom headers", () => {
    const { builder, getHandler } = buildAndCapture();
    builder.resolves("data").withHeaders({ "x-custom": "value" });
    expect(getHandler().headers).toEqual({ "x-custom": "value" });
  });

  it("sets custom status code", () => {
    const { builder, getHandler } = buildAndCapture();
    builder.resolves("data").withStatus(201);
    expect(getHandler().status).toBe(201);
  });

  it("sets required scenario state", () => {
    const { builder, getHandler } = buildAndCapture();
    builder.resolves("data").inState("authenticated");
    expect(getHandler().requiredState).toBe("authenticated");
  });

  it("sets state transition", () => {
    const { builder, getHandler } = buildAndCapture();
    builder.resolves("data").transitionTo("logged-in");
    expect(getHandler().newState).toBe("logged-in");
  });

  it("creates sequence of responses", () => {
    const { builder, getHandler } = buildAndCapture();
    builder.sequence(["first", "second", "third"]);

    const next = getHandler().nextStep;
    expect(next).toBeDefined();
    const answers = [next?.(), next?.(), next?.(), next?.()].map((step) => step?.data);
    // Stays on last after exhaustion
    expect(answers).toEqual(["first", "second", "third", "third"]);
  });

  it("supports method chaining", () => {
    const { builder, getHandler } = buildAndCapture();
    builder
      .resolves("data")
      .withStatus(201)
      .withHeaders({ "x-id": "1" })
      .withLatency("wifi")
      .once()
      .inState("ready")
      .transitionTo("done");

    const h = getHandler();
    expect(h.status).toBe(201);
    expect(h.headers).toEqual({ "x-id": "1" });
    expect(h.latency).toBe("wifi");
    expect(h.remaining).toBe(1);
    expect(h.requiredState).toBe("ready");
    expect(h.newState).toBe("done");
  });
});

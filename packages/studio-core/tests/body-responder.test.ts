import { createKeptBodies } from "@noverax/courier/internal";
import type { Socket } from "socket.io-client";
import { describe, expect, it, vi } from "vitest";

import { answerBodyRequests } from "../src/runtime/body-responder";

function socketWith() {
  const handlers = new Map<string, (asked: unknown, answer: unknown) => void>();
  const socket = {
    on: (event: string, handler: (asked: unknown, answer: unknown) => void) => {
      handlers.set(event, handler);
    },
  };
  return { socket: socket as unknown as Socket, handlers };
}

describe("answerBodyRequests", () => {
  it("sends Studio the whole body of a request it keeps", () => {
    const { socket, handlers } = socketWith();
    const bodies = createKeptBodies();
    bodies.keep("req_1", "response", { value: [], whole: { text: "[1,2]", bytes: 5 } });
    answerBodyRequests(socket, bodies);
    const answer = vi.fn();

    handlers.get("runtime:body")?.({ requestId: "req_1", part: "response" }, answer);

    expect(answer).toHaveBeenCalledWith({ ok: true, data: "[1,2]" });
  });

  it("says why when it no longer keeps the body, or Studio named none", () => {
    const { socket, handlers } = socketWith();
    answerBodyRequests(socket, createKeptBodies());
    const gone = vi.fn();
    const unnamed = vi.fn();

    handlers.get("runtime:body")?.({ requestId: "req_9", part: "request" }, gone);
    handlers.get("runtime:body")?.({ requestId: "req_9", part: "both" }, unnamed);

    expect(gone).toHaveBeenCalledWith({
      ok: false,
      error: expect.stringContaining("no longer keeps this request's whole request body"),
    });
    expect(unnamed).toHaveBeenCalledWith({
      ok: false,
      error: expect.stringContaining("which body"),
    });
  });
});

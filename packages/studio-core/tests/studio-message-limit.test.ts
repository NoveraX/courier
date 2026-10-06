/**
 * What Studio said it takes from a runtime in one message, and the refusal
 * sent in place of a larger one: Studio closes the connection of a runtime
 * that sends more, and every call it was serving with it.
 */
import { describe, expect, it } from "vitest";

import { limitedResponderSocket } from "../src/runtime/limited-responder-socket";
import { studioMessageLimit } from "../src/runtime/studio-message-limit";

const MB = 1024 * 1024;

describe("studioMessageLimit", () => {
  it("refuses nothing until Studio has said its limit", () => {
    expect(studioMessageLimit().refusal("This answer", "x".repeat(5 * MB))).toBeNull();
  });

  it("refuses a message larger than Studio takes, room for the packet kept", () => {
    const limit = studioMessageLimit();
    limit.welcome({ maxMessageBytes: MB });

    expect(limit.refusal("This answer", "x".repeat(MB - 2048))).toBeNull();
    expect(limit.refusal("This answer", "x".repeat(MB))).toMatch(/^This answer is 1\.0 MB, more/);
  });

  it("counts the bytes a message is sent as, not its characters", () => {
    const limit = studioMessageLimit();
    limit.welcome({ maxMessageBytes: MB });

    expect(limit.refusal("This answer", "я".repeat(0.6 * MB))).not.toBeNull();
  });

  it("ignores what is not a limit", () => {
    const limit = studioMessageLimit();
    limit.welcome({ maxMessageBytes: "1 MB" });
    limit.welcome(undefined);

    expect(limit.refusal("This answer", "x".repeat(5 * MB))).toBeNull();
  });
});

describe("limitedResponderSocket", () => {
  function recording() {
    const sent: Array<[string, unknown]> = [];
    return {
      sent,
      socket: {
        on: () => {},
        emit: (event: string, payload: unknown) => sent.push([event, payload]),
      },
    };
  }

  it("sends an answer that fits as it is", () => {
    const { sent, socket } = recording();
    const limit = studioMessageLimit();
    limit.welcome({ maxMessageBytes: MB });

    limitedResponderSocket(socket, limit).emit("playground:end", { rid: "r1", data: [1, 2] });

    expect(sent).toEqual([["playground:end", { rid: "r1", data: [1, 2] }]]);
  });

  it("ends a call whose answer is larger than Studio takes with an error saying so", () => {
    const { sent, socket } = recording();
    const limit = studioMessageLimit();
    limit.welcome({ maxMessageBytes: MB });

    limitedResponderSocket(socket, limit).emit("playground:end", {
      rid: "r2",
      data: "x".repeat(2 * MB),
    });

    expect(sent).toEqual([
      [
        "playground:error",
        { rid: "r2", error: { message: expect.stringContaining("more than Studio takes") } },
      ],
    ]);
  });
});

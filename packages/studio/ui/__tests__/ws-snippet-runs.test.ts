/**
 * The Courier call Studio writes for a WebSocket request reads its messages
 * with `on("data")`, and a request does not say which kind of channel it
 * was: a push channel and one the caller sends on are the same subscription
 * object, so the snippet runs as written on either.
 */
import { createMockSSESubscription, createMockWSChannel } from "@noverax/courier/testing";
import { describe, expect, it, vi } from "vitest";
import { requestSnippet } from "@/features/requests/request-snippets";
import { requestEntry } from "./request-entry-fixture";

const ws = requestEntry({ transport: "ws", url: "ws://localhost:5173/ws", method: "room" });

/* Run the snippet on a caller whose `users.room()` opens what `open` gives, and hand back what it logged. */
async function logged(open: () => unknown): Promise<unknown[]> {
  const lines: unknown[] = [];
  const snippet = new Function("caller", "console", requestSnippet(ws, "courier").code);
  snippet({ users: { room: open } }, { log: (line: unknown) => lines.push(line) });
  await vi.waitFor(() => expect(lines.length).toBeGreaterThan(0));
  return lines;
}

describe("the Courier snippet of a WebSocket request", () => {
  it("reads a push channel's messages", async () => {
    const push = () =>
      createMockSSESubscription(async function* () {
        yield { data: "tick" };
      });

    expect(await logged(push)).toEqual(["tick"]);
  });

  it("reads the messages of a channel the caller sends on", async () => {
    const channel = () =>
      createMockWSChannel<string, string>({
        onJoin: (ctx) => ctx.send("welcome"),
        onMessage: () => undefined,
      });

    expect(await logged(channel)).toEqual(["welcome"]);
  });
});

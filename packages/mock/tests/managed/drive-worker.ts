import { vi } from "vitest";

import { runMockWorker } from "../../src/managed/run-mock-worker";
import type { ChildMessage, ParentMessage } from "../../src/managed/types";

/** A mock worker run in the test process, driven as Studio drives it over IPC */
export interface DrivenWorker {
  /** Every message the worker sent Studio, in order */
  sent: ChildMessage[];
  /** Deliver a message from Studio */
  deliver(message: ParentMessage): void;
  /** Resolve with the first message sent, now or later, that `match` accepts */
  next<TMessage extends ChildMessage>(
    match: (message: ChildMessage) => message is TMessage,
  ): Promise<TMessage>;
  /** Send a command and resolve with its result */
  command(
    command: Record<string, unknown>,
  ): Promise<Extract<ChildMessage, { type: "command-result" }>>;
}

/**
 * Run `runMockWorker` in this process, with its IPC and exit captured: the
 * listener it registers receives what `deliver` sends, and what it sends
 * Studio lands in `sent`. `stopWorker` ends it and gives the process its IPC
 * back; restore the spies with `vi.restoreAllMocks()`.
 */
export function driveWorker(definition: unknown): DrivenWorker {
  const sent: ChildMessage[] = [];
  const waiting = new Set<(message: ChildMessage) => boolean>();
  const on = vi.spyOn(process, "on").mockImplementation(() => process);
  vi.spyOn(process, "once").mockImplementation(() => process);
  vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  process.send = (message: ChildMessage): boolean => {
    sent.push(message);
    for (const settle of waiting) if (settle(message)) waiting.delete(settle);
    return true;
  };
  runMockWorker(async () => definition);
  const listener = on.mock.calls.find(([event]) => event === "message")?.[1];
  if (listener === undefined) throw new Error("runMockWorker registered no message listener");

  const worker: DrivenWorker = {
    sent,
    deliver: (message) => listener(message),
    next(match) {
      const found = sent.find(match);
      if (found) return Promise.resolve(found);
      return new Promise((resolve) => {
        waiting.add((message) => {
          if (!match(message)) return false;
          resolve(message);
          return true;
        });
      });
    },
    command(command) {
      const requestId = `r${sent.length}-${Math.random()}`;
      const result = worker.next(
        (m): m is Extract<ChildMessage, { type: "command-result" }> =>
          m.type === "command-result" && m.requestId === requestId,
      );
      worker.deliver({ type: "command", command, requestId });
      return result;
    },
  };
  return worker;
}

/** Start the driven worker on a free port and resolve with the URL it serves */
export async function startWorker(worker: DrivenWorker): Promise<string> {
  worker.deliver({
    type: "start",
    mocksFile: "/app/courier.mocks.ts",
    mockKey: "api",
    port: 0,
    transformCacheDirectory: null,
    storeFile: null,
  });
  const ready = await worker.next(
    (m): m is Extract<ChildMessage, { type: "ready" }> => m.type === "ready",
  );
  return ready.url;
}

/** Stop the driven worker, wait until its server has closed, and restore `process.send` */
export async function stopWorker(worker: DrivenWorker): Promise<void> {
  worker.deliver({ type: "stop" });
  await worker.next((m): m is Extract<ChildMessage, { type: "stopped" }> => m.type === "stopped");
  process.send = undefined;
}

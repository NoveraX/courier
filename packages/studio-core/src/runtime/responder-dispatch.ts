/**
 * Per-transport dispatch helpers for the playground responder. Each helper
 * runs the canonical local executor and forwards results back to Studio via
 * `playground:chunk` / `playground:end`. Errors propagate up to the caller
 * which translates them into `playground:error`.
 */

import type { executeRequest } from "@noverax/courier";
import type { Sources } from "@noverax/courier/define";
import type {
  executeDirectSSE,
  executeDirectWSChannel,
  InProcessWSChannel,
} from "@noverax/courier/internal-streams";
import type { PlaygroundExecutePayload } from "./playground-payloads";
import type { ResponderSocket } from "./playground-responder";

export async function dispatchHttp(
  socket: ResponderSocket,
  payload: PlaygroundExecutePayload,
  sources: Sources,
  exec: typeof executeRequest,
): Promise<void> {
  const startedAt = performance.now();
  try {
    const data = await exec(sources, {
      source: payload.source,
      group: payload.group,
      method: payload.method,
      variables: (payload.variables as Record<string, unknown>) ?? {},
      options: { headers: payload.headers ?? {} },
    });
    socket.emit("playground:chunk", {
      rid: payload.rid,
      chunk: { kind: "http-result", data, status: 200 },
    });
    socket.emit("playground:end", {
      rid: payload.rid,
      summary: { durationMs: performance.now() - startedAt },
    });
  } catch (err) {
    const e = err as { status?: number; message?: string; data?: { message?: string } };
    socket.emit("playground:chunk", {
      rid: payload.rid,
      chunk: {
        kind: "http-result",
        status: e.status ?? 500,
        error: e.data?.message ?? e.message ?? "HTTP request failed",
      },
    });
    socket.emit("playground:end", {
      rid: payload.rid,
      summary: { durationMs: performance.now() - startedAt },
    });
  }
}

export async function dispatchSSE(
  socket: ResponderSocket,
  payload: PlaygroundExecutePayload,
  sources: Sources,
  signal: AbortSignal,
  exec: typeof executeDirectSSE,
): Promise<void> {
  const startedAt = performance.now();
  const subscription = await exec(
    sources,
    {
      source: payload.source,
      group: payload.group,
      method: payload.method,
      variables: (payload.variables as Record<string, unknown>) ?? {},
      headers: payload.headers ?? {},
    },
    { signal },
  );

  let count = 0;
  try {
    for await (const event of subscription) {
      count++;
      socket.emit("playground:chunk", {
        rid: payload.rid,
        chunk: { kind: "sse-event", event },
      });
    }
  } finally {
    socket.emit("playground:end", {
      rid: payload.rid,
      summary: { durationMs: performance.now() - startedAt, count },
    });
  }
}

export async function dispatchWS(
  socket: ResponderSocket,
  payload: PlaygroundExecutePayload,
  sources: Sources,
  signal: AbortSignal,
  exec: typeof executeDirectWSChannel,
  onChannelOpen?: (channel: InProcessWSChannel) => void,
): Promise<void> {
  const startedAt = performance.now();
  const channel = await exec(
    sources,
    {
      source: payload.source,
      group: payload.group,
      method: payload.method,
      variables: (payload.variables as Record<string, unknown>) ?? {},
      headers: payload.headers ?? {},
    },
    { signal },
  );
  onChannelOpen?.(channel);

  const unsubData = channel.on("data", (data: unknown) => {
    socket.emit("playground:chunk", {
      rid: payload.rid,
      chunk: { kind: "ws-message", data },
    });
  });

  // Resolve on EITHER (a) external abort signal, OR (b) channel reaching the
  // `disconnected` status — server-initiated closes and natural completions
  // both transition through this state. Without (b) the function would hang
  // forever when the channel closes naturally and `playground:end` would
  // never reach Studio.
  await new Promise<void>((resolve) => {
    if (signal.aborted || channel.status === "disconnected") {
      resolve();
      return;
    }
    let settled = false;
    const settle = (): void => {
      if (settled) return;
      settled = true;
      unsubStatus();
      resolve();
    };
    const unsubStatus = channel.on("status", (status) => {
      if (status === "disconnected") settle();
    });
    signal.addEventListener("abort", settle, { once: true });
  });

  unsubData();
  channel.close();
  socket.emit("playground:end", {
    rid: payload.rid,
    summary: { durationMs: performance.now() - startedAt },
  });
}

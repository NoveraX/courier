/* The thread the Jest transformer reads the routes on: it takes each request,
   reads with the engine every bundler's plugin uses — in a process of its own —
   answers on the port the request brought, and wakes the transformer, which
   waits for it. The engine stays, so an unchanged project is not read again. */
import type { MessagePort } from "node:worker_threads";
import { parentPort } from "node:worker_threads";

import { routesCommonJsCode, routesModuleCode } from "../engine/routes-module-code";
import { sharedEngine } from "../engine/shared-engine";
import { isRecord } from "../util/is-record";
import type { RoutesThreadReply, RoutesThreadRequest } from "./routes-thread-messages";

parentPort?.on("message", (message: unknown) => {
  if (!isRecord(message) || !isRecord(message.request)) return;
  const { port, signal } = message;
  if (!(signal instanceof Int32Array) || !isPort(port)) return;
  const request = requestOf(message.request);
  void answer(request).then((reply) => {
    port.postMessage(reply);
    port.close();
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0);
  });
});

async function answer(request: RoutesThreadRequest): Promise<RoutesThreadReply> {
  try {
    const engine = sharedEngine({ root: request.root, config: request.config, envFiles: [] });
    const snapshot = await engine.read();
    return { ok: true, module: routesModuleCode(snapshot), commonJs: routesCommonJsCode(snapshot) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function requestOf(request: Record<string, unknown>): RoutesThreadRequest {
  const root = typeof request.root === "string" ? request.root : process.cwd();
  return typeof request.config === "string" ? { root, config: request.config } : { root };
}

function isPort(value: unknown): value is MessagePort {
  return isRecord(value) && typeof value.postMessage === "function";
}

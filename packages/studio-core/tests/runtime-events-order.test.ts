/**
 * What a runtime sends Studio about a Playground call arrives in the order
 * it happened: the call's events before its answer. Studio names the agent
 * a call ran for on the call's start and forgets the call once the answer
 * arrives, so a start that came after its answer would go unnamed. A call
 * refused by its schema starts and ends within one turn of the event loop —
 * the turn whose events leave together once it is over.
 *
 * A real Socket.IO server stands in for Studio; the runtime's hooks are
 * wired to its bus as `attachRuntime` wires them.
 */
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { registerSources } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { createKeptBodies, studioHooks } from "@noverax/courier/internal";
import { Server, type Socket } from "socket.io";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { EventBus } from "../src/event-bus";
import { connectRuntimeSocket } from "../src/runtime/connect-runtime-socket";
import { wireHooks } from "../src/runtime/hooks";

const cleanups: Array<() => void | Promise<void>> = [];
const arrived: string[] = [];
let runtime: Socket | undefined;

beforeAll(async () => {
  const { endpoint } = courier();
  const users = defineGroup({
    prefix: "users",
    endpoints: {
      create: endpoint
        .post("")
        .variables(z.object({ name: z.string().min(2) }))
        .response<{ id: number }>(),
    },
  });
  registerSources({ api: defineApi({ baseURL: "http://127.0.0.1:9", groups: { users } }) });
  const bus = new EventBus();
  wireHooks(bus, "app", (name) => name, createKeptBodies(1024 * 1024));
  cleanups.push(() => {
    for (const key of Object.keys(studioHooks)) Reflect.deleteProperty(studioHooks, key);
  });

  const http: HttpServer = createServer();
  const io = new Server(http);
  const connected = new Promise<void>((resolve) => {
    io.of("/runtime").on("connection", (socket) => {
      runtime = socket;
      socket.on("events", (batch: Uint8Array) => {
        const events: Array<{ type: string }> = JSON.parse(new TextDecoder().decode(batch));
        arrived.push(...events.map((event) => event.type));
      });
      for (const name of ["playground:end", "playground:error"]) {
        socket.on(name, () => arrived.push(name));
      }
      resolve();
    });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => {
    io.close();
  });
  const studioUrl = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  await connectRuntimeSocket({ runtimeId: "app", kind: "server", studioUrl, bus }, [], {
    setDisposer: (dispose) => cleanups.push(dispose),
    setAnnouncer: () => {},
  });
  await connected;
});

afterAll(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function until(check: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("a Playground call refused by its schema", () => {
  it("reaches Studio as its events, then its answer", async () => {
    runtime?.emit("playground:execute", {
      rid: "refused",
      source: "api",
      group: "users",
      method: "create",
      transport: "http",
      variables: { name: "a" },
    });
    await until(() => arrived.some((name) => name.startsWith("playground:")), "the answer");

    const answer = arrived.findIndex((name) => name.startsWith("playground:"));
    expect(arrived.indexOf("request:start")).toBeGreaterThanOrEqual(0);
    expect(arrived.indexOf("request:start")).toBeLessThan(answer);
    expect(arrived.lastIndexOf("request:error")).toBeLessThan(answer);
  });
});

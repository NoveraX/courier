/**
 * Stopping the server while an SSE generator waits on an event that never
 * comes. The response never ended, so `stop()` never returned and a SIGTERM
 * under Docker or Kubernetes hung until SIGKILL.
 */
import { courier } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";

import { createCourierServer } from "../src/create-server";

const { stream } = courier();

describe("stop()", () => {
  it("finishes while a generator is parked", async () => {
    const feed = stream.response<string>().implement(async function* () {
      yield { data: "hello" };
      await new Promise(() => {});
    });
    const server = createCourierServer({
      sources: { api: { options: {}, feed } } as never,
      port: 0,
      signals: false,
    });
    const url = await server.ready;

    const response = await fetch(`${url}/api/sse?_s=api&_m=feed`, {
      headers: { accept: "text/event-stream" },
    });
    await response.body?.getReader().read();

    const started = Date.now();
    await server.stop();

    expect(Date.now() - started).toBeLessThan(5000);
  }, 15_000);
});

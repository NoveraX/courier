import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import type { AdapterHandler } from "@noverax/courier";
import { describe, expect, it, vi } from "vitest";

import { createRequestListener } from "../src/http-handlers";

describe("createRequestListener", () => {
  it("answers a handler that fails in the shape every adapter answers with", async () => {
    const failing = {
      handle: () => Promise.reject(new Error("boom")),
    } as unknown as AdapterHandler;
    const server = createServer(createRequestListener(failing, undefined, () => false));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/api/request?_s=api&_m=hello`);

    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ success: false, message: "Internal server error" });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  /* Ended, the part of the answer sent passed for the whole of it. */
  it("cuts off an answer whose body breaks after its head", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const breaking = {
      handle: () => Promise.resolve(new Response(breakingBody())),
    } as unknown as AdapterHandler;
    const listener = createRequestListener(breaking, undefined, () => false);
    let served: Promise<void> | undefined;
    const server = createServer((req, res) => {
      served = listener(req, res);
    });
    try {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const { port } = server.address() as AddressInfo;

      const outcome = await fetch(`http://127.0.0.1:${port}/api/request?_s=api&_m=hello`)
        .then((response) => response.text())
        .then(
          () => "whole",
          (error: unknown) => (error instanceof Error ? error.name : "unknown"),
        );

      expect(outcome).toBe("TypeError");
      await expect(served).resolves.toBeUndefined();
      expect(logged).toHaveBeenCalled();
    } finally {
      logged.mockRestore();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

/** A body that sends its first chunk, then fails as an upstream that reset would. */
function breakingBody(): ReadableStream<Uint8Array> {
  let sent = false;
  return new ReadableStream({
    async pull(controller) {
      if (!sent) {
        sent = true;
        controller.enqueue(new TextEncoder().encode("first chunk\n"));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw new Error("upstream reset mid-body");
    },
  });
}

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import type { AdapterHandler } from "@noverax/courier";
import { describe, expect, it } from "vitest";

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
});

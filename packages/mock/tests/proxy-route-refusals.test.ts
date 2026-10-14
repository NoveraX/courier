/**
 * The mock's proxy routes refuse what the proxy of the API it stands in for
 * refuses — an endpoint the API keeps from a page, a GET to anything but a
 * read, a GET to a read whose variables stay out of the address, a stream
 * the API keeps from a page — with the proxy's status and body, so a page
 * that works against the mock is not refused once it calls the real proxy,
 * and reads a refusal's message as the proxy writes it. A mock that knows
 * no API answers every name, as it did.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAutoMockServer } from "../src/auto/create-auto-server";
import { createMockServer } from "../src/server/create-mock-server";

const { endpoint, stream } = courier();

const api = defineApi({
  baseURL: "https://api.example.com",
  expose: true,
  groups: {
    shop: defineGroup({
      prefix: "shop",
      endpoints: {
        list: endpoint.get("items").response<{ id: string }[]>(),
        lookup: endpoint.get("lookup", { sensitiveVariables: true }).variables<{ email: string }>(),
        buy: endpoint.post("buy").variables<{ id: string }>(),
        audit: endpoint.get("audit").expose(false),
        hidden: stream.get("hidden").expose(false),
      },
    }),
  },
});

const server = createAutoMockServer({ source: api, port: 0, log: false });
let url: string;

beforeAll(async () => {
  url = (await server.start()).url;
});

afterAll(async () => {
  await server.stop();
});

function call(method: string, verb: "GET" | "POST"): Promise<Response> {
  const address = `${url}/api/request?_s=api&_g=shop&_m=${method}`;
  if (verb === "GET") return fetch(address);
  return fetch(address, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ variables: {} }),
  });
}

describe("the mock's proxy routes, for the API they stand in for", () => {
  it("refuse an endpoint the API keeps from a page, as an unknown name", async () => {
    const response = await call("audit", "POST");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      message: "[api][shop][audit]: method not found",
    });
  });

  it("refuse a GET to a write, and to a read whose variables stay out of the address", async () => {
    expect((await call("buy", "GET")).status).toBe(405);
    expect((await call("lookup", "GET")).status).toBe(405);
  });

  it("answer the calls the proxy runs", async () => {
    expect((await call("list", "GET")).status).toBe(200);
    expect((await call("lookup", "POST")).status).toBe(200);
    expect((await call("buy", "POST")).status).not.toBe(405);
  });

  it("refuse a stream the API keeps from a page", async () => {
    const response = await fetch(`${url}/api/sse?_s=api&_g=shop&_m=hidden`);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      message: "[api][shop][hidden]: method not found",
    });
  });
});

describe("a mock that knows no API", () => {
  it("answers every name its handlers answer, as it did", async () => {
    const bare = createMockServer({ port: 0, log: false });
    bare.mock("shop", "audit").resolves({ ok: true });
    const { url: bareUrl } = await bare.start();
    try {
      const response = await fetch(`${bareUrl}/api/request?_s=api&_g=shop&_m=audit`, {
        method: "POST",
      });

      expect(response.status).toBe(200);
    } finally {
      await bare.stop();
    }
  });
});

/**
 * A proxy caller's `.raw` call against the mock server.
 *
 * A Courier proxy answers a call that asks for the raw response with the
 * response around the data — its status and headers — and the proxy client
 * resolves to that. The mock server answers it the same way, so `.raw`
 * resolves to the status and headers too, not to the bare data.
 */
import { createProxyCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { routesOf } from "@noverax/courier/internal";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMockServer } from "../src/server/create-mock-server";

const { endpoint } = courier();
type User = { id: number; name: string };
const api = defineApi({
  expose: true,
  baseURL: "http://placeholder.invalid",
  groups: {
    users: defineGroup({
      prefix: "users",
      endpoints: { getAll: endpoint.get("").response<User[]>() },
    }),
  },
});

const server = createMockServer({ port: 0, log: false });
let proxyUrl: string;

beforeAll(async () => {
  server
    .mock("users", "getAll")
    .withHeaders({ "x-total-count": "1" })
    .resolves([{ id: 1, name: "Ada" }]);
  proxyUrl = `${(await server.start()).url}/api/request`;
});

afterAll(async () => {
  await server.stop();
});

describe("a raw proxy call", () => {
  it("resolves to the status, headers and data", async () => {
    const client = createProxyCaller(routesOf(api, "api"), { proxyPath: { http: proxyUrl } });

    const response = await client.raw.users.getAll();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-total-count")).toBe("1");
    expect(response.data).toEqual([{ id: 1, name: "Ada" }]);
  });

  it("leaves a call that did not ask for it answering the data", async () => {
    const client = createProxyCaller(routesOf(api, "api"), { proxyPath: { http: proxyUrl } });
    expect(await client.users.getAll()).toEqual([{ id: 1, name: "Ada" }]);
  });
});

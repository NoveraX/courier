import { createCaller, HTTPError } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMockClient } from "../../src/create-mock-client";
import type { MockServer } from "../../src/server/create-mock-server";
import { createMockServer } from "../../src/server/create-mock-server";

const { endpoint } = courier();

function apiAt(baseURL: string) {
  return defineApi({
    baseURL,
    groups: {
      users: defineGroup({
        prefix: "users",
        endpoints: {
          getById: endpoint.get(":id").variables<{ id: number }>().response<{ id: number }>(),
        },
      }),
    },
  });
}

async function rejection(call: () => Promise<unknown>): Promise<HTTPError> {
  const error = await call().then(
    () => undefined,
    (caught: unknown) => caught,
  );
  if (!(error instanceof HTTPError)) throw new Error(`expected an HTTPError, got ${error}`);
  return error;
}

describe("a rejects() answer from the mock server", () => {
  let server: MockServer;
  let url: string;

  beforeAll(async () => {
    server = createMockServer({
      port: 0,
      log: false,
      mappings: [
        {
          prefix: "/users",
          group: "users",
          methods: ["getById"],
          endpoints: [{ name: "getById", operation: "get", path: ":id" }],
        },
      ],
    });
    ({ url } = await server.start());
  });

  afterAll(async () => {
    await server.stop();
  });

  it("carries the declared body, as the mock client's rejection does", async () => {
    server.mock("users", "getById").rejects(404, { message: "Not found" });
    const unit = createMockClient<ReturnType<typeof apiAt>>();
    unit.mock("users", "getById").rejects(404, { message: "Not found" });

    const overHttp = await rejection(() => createCaller(apiAt(url)).users.getById({ id: 7 }));
    const inProcess = await rejection(() => unit.client.users.getById({ id: 7 }));

    expect(overHttp.status).toBe(404);
    expect(overHttp.data).toEqual({ message: "Not found" });
    expect(overHttp.data).toEqual(inProcess.data);
  });

  it("carries the default body of a rejects() without one, as the mock client does", async () => {
    server.mock("users", "getById").rejects(500);
    const unit = createMockClient<ReturnType<typeof apiAt>>();
    unit.mock("users", "getById").rejects(500);

    const overHttp = await rejection(() => createCaller(apiAt(url)).users.getById({ id: 7 }));
    const inProcess = await rejection(() => unit.client.users.getById({ id: 7 }));

    expect(overHttp.data).toEqual(inProcess.data);
  });

  it("still sets Retry-After from the declared body of a 503", async () => {
    server.mock("users", "getById").rejects(503, { message: "down", retryAfter: 7 });

    const response = await fetch(`${url}/users/7`);

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("7");
    expect(await response.json()).toEqual({ message: "down", retryAfter: 7 });
  });
});

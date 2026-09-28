import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockHttpError } from "../../src/server/errors";
import type { MockServer } from "../../src/server/create-mock-server";
import { createMockServer } from "../../src/server/create-mock-server";

let server: MockServer;
let url: string;

beforeAll(async () => {
  server = createMockServer({ port: 0, log: false });
  server.mock("users", "getById").returns(() => {
    throw new MockHttpError(404, "user 12345 not found");
  });
  ({ url } = await server.start());
});

afterAll(async () => {
  await server.stop();
});

describe("GET /__admin/history", () => {
  it("gives each failed request's error with its message", async () => {
    await fetch(`${url}/api/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: "users", method: "getById", variables: { id: 12345 } }),
    });

    const history = await fetch(`${url}/__admin/history`).then((res) => res.json());

    expect(history.at(-1)).toMatchObject({
      group: "users",
      method: "getById",
      error: { name: "Error", message: "user 12345 not found" },
    });
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { MockServer } from "../../src/server/create-mock-server";
import { createMockServer } from "../../src/server/create-mock-server";

let server: MockServer;
let url: string;

beforeAll(async () => {
  server = createMockServer({ port: 0, log: false });
  server.mock("users", "create").returns((ctx) => ({ received: ctx.variables ?? null }));
  ({ url } = await server.start());
});

afterAll(async () => {
  await server.stop();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function post(path: string, body: string): Promise<Response> {
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("request bodies the mock server cannot read", () => {
  it("answers 400 with a JSON error to malformed JSON on /api/request, logging no stack", async () => {
    const consoleError = vi.spyOn(console, "error");

    const response = await post("/api/request?_s=api&_g=users&_m=getAll", "{not json");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      message: "The request body is not valid JSON",
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("answers 400 to a JSON body on /api/request that is not an object", async () => {
    const response = await post("/api/request?_s=api&_g=users&_m=getAll", "[1, 2]");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      message: "The body must be an object: { variables, options }",
    });
  });

  it("answers 400 to malformed JSON on a REST route instead of calling the mock without it", async () => {
    const response = await post("/api/users/create", "{not json");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "The request body is not valid JSON" });
  });

  it("still calls a REST route's mock with no variables when the body is empty", async () => {
    const response = await post("/api/users/create", "");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: null });
  });
});

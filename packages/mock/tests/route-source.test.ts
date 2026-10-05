/**
 * Studio shows, for each route and each request, whose handler answered:
 * the one the mock generated from the source, one of the user's, or a
 * scenario's. A user's handler must read as theirs even where nothing was
 * generated beneath it — a stream, or a route of a hand-written server.
 */
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { describe, expect, it } from "vitest";

import { createAutoMockServer } from "../src/auto/create-auto-server";
import { createMockServer } from "../src/server/create-mock-server";

const { endpoint, stream } = courier();

type User = { id: number; name: string };

function api() {
  return defineApi({
    baseURL: "http://localhost:1",
    groups: {
      users: defineGroup({
        prefix: "users",
        endpoints: {
          getAll: endpoint.get("").response<User[]>(),
          create: endpoint.post("").variables<{ name: string }>().response<User>(),
        },
      }),
      live: defineGroup({
        prefix: "live",
        endpoints: { ticker: stream.get("ticker").response<{ price: number }>() },
      }),
    },
  });
}

describe("a route's source", () => {
  it("is the mock's own where it generated the handler and nothing replaced it", () => {
    const server = createAutoMockServer({ source: api(), admin: false, log: false });

    expect(server.getRouteSource("users", "getAll")).toBe("auto");
  });

  it("is an override where the user's handler sits on the generated one", () => {
    const server = createAutoMockServer({
      source: api(),
      admin: false,
      log: false,
      overrides: (mock) => {
        mock("users", "create").resolves({ id: 1, name: "Ada" });
      },
    });

    expect(server.getRouteSource("users", "create")).toBe("override");
    expect(server.getRouteSource("users", "getAll")).toBe("auto");
  });

  it("is an override for a stream the user answers, though nothing was generated for it", () => {
    const server = createAutoMockServer({
      source: api(),
      admin: false,
      log: false,
      overrides: (mock) => {
        mock("live", "ticker").stream(async function* () {
          yield { data: { price: 1 } };
        });
      },
    });

    expect(server.getRouteSource("live", "ticker")).toBe("override");
  });

  it("is an override for a hand-written server's route, which only the user answers", () => {
    const server = createMockServer({ admin: false, log: false });
    server.mock("users", "getAll").resolves([]);

    expect(server.getRouteSource("users", "getAll")).toBe("override");
  });
});

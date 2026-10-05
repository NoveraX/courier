/**
 * The network conditions a mock client answers under: a route's own
 * override wins over the conditions every route has, and a delay is drawn
 * in the distribution the conditions name — as a mock server answers.
 */
import { HTTPError } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockClient } from "../src/create-mock-client";

const { endpoint } = courier();

type User = { id: number; name: string };

const users = defineGroup({
  prefix: "users",
  endpoints: {
    getAll: endpoint.get("").response<User[]>(),
    getById: endpoint.get(":id").variables<{ id: number }>().response<User>(),
  },
});
const api = defineApi({ baseURL: "http://placeholder.invalid", groups: { users } });

const ADA: User = { id: 1, name: "Ada" };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("a mock client's route override", () => {
  it("fails the route it names, and no other", async () => {
    const { client, mock } = createMockClient<typeof api>({
      network: {
        errorRate: 0,
        routeOverrides: [{ routeId: "users:getAll", enabled: true, errorRate: 1 }],
      },
    });
    mock("users", "getAll").resolves([ADA]);
    mock("users", "getById").resolves(ADA);

    await expect(client.users.getAll()).rejects.toBeInstanceOf(HTTPError);
    await expect(client.users.getById({ id: 1 })).resolves.toEqual(ADA);
  });

  it("delays the route it names by its own latency", async () => {
    vi.useFakeTimers();
    const { client, mock } = createMockClient<typeof api>({
      network: {
        routeOverrides: [
          { routeId: "users:getAll", enabled: true, latency: { min: 300, max: 300 } },
        ],
      },
    });
    mock("users", "getAll").resolves([ADA]);
    mock("users", "getById").resolves(ADA);
    let listed = false;
    void client.users.getAll().then(() => {
      listed = true;
    });

    await expect(client.users.getById({ id: 1 })).resolves.toEqual(ADA);
    await vi.advanceTimersByTimeAsync(299);
    expect(listed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(listed).toBe(true);
  });
});

describe("a mock client's delay", () => {
  it("is drawn in the distribution its network names", async () => {
    vi.useFakeTimers();
    /* Every draw at the middle: uniform lands on 500 ms, normal well short of it. */
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { client, mock } = createMockClient<typeof api>({
      network: { latency: { min: 0, max: 1000 }, distribution: "normal" },
    });
    mock("users", "getAll").resolves([ADA]);
    let listed = false;
    void client.users.getAll().then(() => {
      listed = true;
    });

    await vi.advanceTimersByTimeAsync(400);

    expect(listed).toBe(true);
  });
});

/**
 * @vitest-environment jsdom
 *
 * The mock's store: a collection's records as a table typed from the
 * route's response shape, a cell edited in place, a record added, deleted,
 * and every collection seeded again — each sent to the mock as a command.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const command = vi.hoisted(() => vi.fn());

vi.mock("@/socket", () => ({
  getSocket: () => ({
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    timeout: () => ({ emit: command }),
  }),
}));

import { collectionView, validateMockStoreSearch } from "@/features/mocks/collection-view";
import { buildDefaultRecord } from "@/features/mocks/data-table-utils";
import { useStudioStore } from "@/store";
import type { MockCollectionEntry, MockRouteEntry } from "@/store/mock-slice";
import { useMockStore } from "@/store/mock-slice";
import { mockServer } from "./mock-server-fixture";
import { openShell } from "./shell-harness";

const USERS: MockCollectionEntry = {
  name: "users",
  count: 2,
  records: [
    { id: "u1", name: "Ada", role: "admin", age: 36 },
    { id: "u2", name: "Lin", role: "member", age: 29 },
  ],
};
const ROUTE: MockRouteEntry = {
  group: "users",
  endpoint: "list",
  httpMethod: "get",
  path: "/users",
  fullPath: "/users",
  source: "auto",
  hits: 0,
  avgLatency: 0,
  responseSchema: { id: "string", name: "string", role: "enum" },
};

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

const sent = () =>
  command.mock.calls.filter(([event]) => event === "mock:command").map(([, payload]) => payload);

beforeEach(() => {
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    requests: [],
    heldRequests: [],
  });
  useMockStore.setState({
    servers: { "api-mock": mockServer({ collections: [USERS], routes: [ROUTE] }) },
    activeServerId: "api-mock",
    logs: [],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("a collection's table", () => {
  it("has a column per field, typed from the route's response shape or the value", () => {
    expect(collectionView(USERS, [ROUTE]).columns.map((c) => `${c.field}:${c.label}`)).toEqual([
      "id:string",
      "name:string",
      "role:enum",
      "age:number",
    ]);
    expect(validateMockStoreSearch({ collection: "" })).toEqual({});
  });

  it("adds a record typed like the others — never null in a typed field — and without an id", () => {
    const people = {
      name: "people",
      count: 2,
      records: [
        { id: 1, name: "Ada", admin: true, tags: ["a"], address: { city: "London" } },
        { id: 2, name: "Grace", admin: false, tags: [], address: { city: "NYC" } },
      ],
    };
    const { columns } = collectionView(people, []);

    const record = buildDefaultRecord(Object.fromEntries(columns.map((c) => [c.field, c.type])));

    expect(record).toEqual({ name: "", admin: false, tags: [], address: {} });
  });
});

describe("the Store tab", () => {
  it("edits a cell in place and sends the change", async () => {
    await openShell("/mocks/store");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Ada" })));
    const input = screen.getByRole("textbox", { name: "Edit value" });
    await settle(() => fireEvent.change(input, { target: { value: "Ada L." } }));
    await settle(() => fireEvent.keyDown(input, { key: "Enter" }));

    expect(sent()).toContainEqual({
      action: "mock:store:update",
      serverId: "api-mock",
      collection: "users",
      id: "u1",
      data: { name: "Ada L." },
    });
  });

  it("adds a record, deletes one, and seeds every collection as the mock declares", async () => {
    await openShell("/mocks/store?collection=users");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Add record" })));
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Delete record u2" })));
    await settle(() =>
      fireEvent.click(
        within(screen.getByRole("navigation", { name: "Collections" })).getByRole("button", {
          name: "Reseed all",
        }),
      ),
    );

    expect(sent()).toEqual([
      {
        action: "mock:store:create",
        serverId: "api-mock",
        collection: "users",
        record: { name: "", role: "", age: 0 },
      },
      { action: "mock:store:delete", serverId: "api-mock", collection: "users", id: "u2" },
      { action: "mock:store:seed", serverId: "api-mock", collection: "*" },
    ]);
  });
});

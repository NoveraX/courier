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
    connected: true,
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    timeout: () => ({ emit: command }),
  }),
}));

import { collectionView, validateMockStoreSearch } from "@/features/mocks/collection-view";
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
      /* The mock makes the record, so every field holds a value its schema accepts. */
      { action: "mock:store:create", serverId: "api-mock", collection: "users" },
      { action: "mock:store:delete", serverId: "api-mock", collection: "users", id: "u2" },
      { action: "mock:store:seed", serverId: "api-mock", collection: "*" },
    ]);
  });
});

describe("the Store tab of a mock whose records the page does not hold yet", () => {
  type Answer = (error: Error | null, reply: unknown) => void;
  const askFor = () =>
    command.mock.calls.filter(([event]) => event === "mock:store:get") as unknown as Array<
      [string, unknown, Answer]
    >;

  beforeEach(() => {
    useMockStore.setState({
      servers: {
        "api-mock": mockServer({
          collections: [{ ...USERS, records: [] }],
          routes: [ROUTE],
          recordsLoaded: false,
        }),
      },
    });
  });

  it("shows each collection's count, asks Studio for the records once, then shows them", async () => {
    await openShell("/mocks/store");
    const nav = screen.getByRole("navigation", { name: "Collections" });

    const users = within(nav).getByRole("button", { name: /^users/ });

    expect(within(users).getByText("2")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Loading the records");
    expect(askFor().map(([, payload]) => payload)).toEqual([{ serverId: "api-mock" }]);

    const reply = {
      ok: true,
      serverId: "api-mock",
      startedAt: 1,
      storeSeq: 0,
      collections: [USERS],
    };
    await settle(() => askFor()[0]?.[2](null, reply));

    expect(screen.getByRole("button", { name: "Ada" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says why Studio did not send the records", async () => {
    const refusal =
      "The demo takes up to 10 requests for a mock's records every 10 s from one page. Try again in a moment.";
    await openShell("/mocks/store");

    await settle(() => askFor()[0]?.[2](null, { ok: false, error: refusal }));

    expect(screen.getByRole("alert").textContent).toBe(
      `Studio did not send the records: ${refusal} The page asks again on its own.`,
    );
    expect(screen.queryByRole("button", { name: "Ada" })).toBeNull();
  });
});

describe("a collection of tens of thousands of records", () => {
  it("draws only the rows in view, and scrolls as far as every record", async () => {
    const records = Array.from({ length: 10_000 }, (_, i) => ({ id: `u${i}`, name: `User ${i}` }));
    useMockStore.setState({
      servers: {
        "api-mock": mockServer({
          collections: [{ name: "users", count: records.length, records }],
          routes: [ROUTE],
        }),
      },
    });

    await openShell("/mocks/store");
    const table = screen.getByRole("region", { name: "Collection users" });
    const drawn = within(table).getAllByRole("button", { name: /^Delete record / });

    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.length).toBeLessThan(100);
    expect(within(table).getByText("User 0")).toBeTruthy();
    expect(within(table).queryByText("User 9999")).toBeNull();
    const body = drawn[0]?.parentElement?.parentElement;
    expect(body?.style.height).toBe(`${10_000 * 38}px`);
  });
});

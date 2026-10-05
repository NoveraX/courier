/**
 * @vitest-environment jsdom
 *
 * The Playground in the new shell: the endpoint the address names, its
 * variables checked against the fields its schema declares, the URL with
 * its parameters, where it is served and the proxy route, a send and its
 * answer as the inspector shows it, the headers a proxy did not forward,
 * one stream at a time, ⌘↵,
 * the recent sends, copying the call as code, why it sends
 * nothing when the variables are not JSON, and what it says without an
 * attached app.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emit = vi.hoisted(() => vi.fn());
const copied = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("@/socket", () => ({
  getSocket: () => ({ emit, on: vi.fn(), off: vi.fn(), connect: vi.fn() }),
}));
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: copied }));
vi.mock("sonner", () => ({ toast }));

import type { ScannedSource } from "@/features/apis/types";
import { usePlaygroundDrafts } from "@/playground/draft-store";
import { useStudioStore } from "@/store";
import { API, BOUND, trafficRequest } from "./playground-fixtures";
import { requestEntry } from "./request-entry-fixture";
import { openShell } from "./shell-harness";

const FIELDS = [
  { path: "name", type: "string", required: true },
  { path: "tags", type: "string[]", required: false },
];

/* The fixture's `users.create`, with the variables schema the scan read. */
const SOURCE: ScannedSource = {
  ...API,
  groups: API.groups.map((group) => ({
    ...group,
    endpoints: group.endpoints.map((e) =>
      e.name === "create"
        ? {
            ...e,
            analysis: {
              ...e.analysis,
              hasVariablesType: true,
              variablesStub: { name: "" },
              variablesFields: FIELDS,
            },
          }
        : e,
    ),
  })),
};

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

function execCalls(): unknown[] {
  return emit.mock.calls
    .filter(([event]) => event === "playground:exec")
    .map(([, payload]) => payload);
}

const editor = () => screen.getByRole("textbox", { name: "Variables" });
const status = () => within(screen.getByRole("region", { name: "Request" })).getByRole("status");
const response = () => screen.getByRole("region", { name: "Response" });

beforeEach(() => {
  usePlaygroundDrafts.setState({ variables: {}, headers: undefined, mode: "direct" });
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    scanSources: [SOURCE],
    bindingSnapshot: BOUND,
    requests: [],
    heldRequests: [],
    playgroundHistory: [],
    playgroundActiveResponse: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the Playground", () => {
  it("opens on the endpoint its address names, its variables checked against its schema", async () => {
    await openShell("/playground?endpoint=api.users.create");

    expect(screen.getByRole("button", { name: "Endpoint: api.users.create" })).toBeTruthy();
    expect(editor()).toHaveProperty("value", '{\n  "name": ""\n}');
    expect(
      within(screen.getByRole("region", { name: "Input schema" }))
        .getAllByText(/required|optional/)
        .map((n) => n.textContent),
    ).toEqual(["required", "optional"]);
    expect(status().textContent).toBe("Valid · every field users.create requires is set");
    await settle(() => fireEvent.change(editor(), { target: { value: "{}" } }));
    expect(status().textContent).toBe('Missing required field "name"');
    await settle(() => fireEvent.change(editor(), { target: { value: "{ nope" } }));
    expect(status().textContent).toMatch(/^Invalid JSON · /);
  });

  it("fills a path parameter from the variables, and marks it while it is missing", async () => {
    await openShell("/playground?endpoint=api.users.byId");

    expect(screen.getByTitle("Set id in the variables").textContent).toBe("/:id");
    await settle(() =>
      fireEvent.change(editor(), { target: { value: '{ "id": 42, "full": true }' } }),
    );
    expect(screen.queryByTitle("Set id in the variables")).toBeNull();
    expect(screen.getByText("/42")).toBeTruthy();
    expect(screen.getByText("?full=true")).toBeTruthy();
  });

  it("shows where the endpoint is served, and the proxy route its source declares", async () => {
    await openShell("/playground?endpoint=api.misc.headers");
    const request = screen.getByRole("region", { name: "Request" });

    expect(request.textContent).toContain("http://localhost:7501/v2/misc/echo/headers");
    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Proxy" })));
    expect(within(request).getByText("via http://localhost:7502/api/request")).toBeTruthy();
  });

  it("says why it sends nothing when the variables are not JSON", async () => {
    await openShell("/playground?endpoint=api.users.byId");

    await settle(() => fireEvent.change(editor(), { target: { value: '{ "id": ' } }));
    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^Send/ })));

    expect(execCalls()).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith("Variables are not valid JSON");
  });

  it("sends the call, then shows its answer from the request it made", async () => {
    await openShell("/playground?endpoint=api.users.create");
    await settle(() => fireEvent.change(editor(), { target: { value: '{ "name": "Ada" }' } }));

    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^Send/ })));

    const [call] = execCalls();
    expect(call).toMatchObject({
      source: "api",
      group: "users",
      method: "create",
      mode: "direct",
      transport: "http",
      variables: { name: "Ada" },
    });
    expect(within(response()).getByText("Sending…")).toBeTruthy();
    const rid = useStudioStore.getState().playgroundHistory[0]?.rid ?? "";
    await settle(() => {
      const store = useStudioStore.getState();
      store.appendPlaygroundChunk(rid, { kind: "http-result", status: 201, data: { id: 7 } });
      store.endPlayground(rid, { durationMs: 40 });
      useStudioStore.setState({
        requests: [
          requestEntry({
            id: `pg_${rid}`,
            group: "users",
            method: "create",
            statusCode: 201,
            data: { id: 7 },
          }),
        ],
      });
    });
    expect(within(response()).getByText("Status · Created")).toBeTruthy();
    expect(within(response()).getByText("201")).toBeTruthy();
    expect(within(response()).getByRole("button", { name: "Inspect" })).toBeTruthy();
  });

  it("lists the headers it wrote that the proxy did not forward, and how to carry them", async () => {
    usePlaygroundDrafts.setState({
      variables: { "api.users.create": '{ "name": "Ada" }' },
      headers: '{ "authorization": "Bearer t", "x-trace": "abc" }',
      mode: "proxy",
    });
    await openShell("/playground?endpoint=api.users.create");
    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^Send/ })));
    const rid = useStudioStore.getState().playgroundHistory[0]?.rid ?? "";
    await settle(() => {
      const store = useStudioStore.getState();
      store.appendPlaygroundChunk(rid, { kind: "http-result", status: 201, data: { id: 7 } });
      store.endPlayground(rid, { durationMs: 40 });
      useStudioStore.setState({
        requests: [
          requestEntry({
            id: `pg_${rid}`,
            group: "users",
            method: "create",
            mode: "proxy",
            statusCode: 201,
            requestHeaders: { Authorization: "Bearer t" },
          }),
        ],
      });
    });

    await settle(() =>
      fireEvent.click(within(response()).getByRole("button", { name: "Headers" })),
    );

    const group = within(
      within(response()).getByRole("region", { name: "Not forwarded by the proxy" }),
    );
    expect(group.getByText("x-trace")).toBeTruthy();
    expect(group.queryByText("authorization")).toBeNull();
    expect(group.getByText(/\.headers\(…\) or its source with allowedHeaders/)).toBeTruthy();
  });

  it("claims no header left behind by a direct call, which sends every header itself", async () => {
    usePlaygroundDrafts.setState({
      variables: { "api.users.create": '{ "name": "Ada" }' },
      headers: '{ "x-client-tag": "pg", "x-not-allowed": "1" }',
    });
    await openShell("/playground?endpoint=api.users.create");
    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^Send/ })));
    const rid = useStudioStore.getState().playgroundHistory[0]?.rid ?? "";
    await settle(() => {
      useStudioStore.getState().endPlayground(rid, { durationMs: 40 });
      useStudioStore.setState({
        requests: [
          requestEntry({
            id: `pg_${rid}`,
            method: "create",
            requestHeaders: { "x-client-tag": "pg", "x-not-allowed": "1" },
          }),
        ],
      });
    });

    await settle(() =>
      fireEvent.click(within(response()).getByRole("button", { name: "Headers" })),
    );

    expect(execCalls()).toEqual([
      expect.objectContaining({ headers: { "x-client-tag": "pg", "x-not-allowed": "1" } }),
    ]);
    expect(
      within(response()).queryByRole("region", { name: "Not forwarded by the proxy" }),
    ).toBeNull();
  });

  it("opens no second stream while one is live: ⌘↵ unsubscribes, as its button does", async () => {
    await openShell("/playground?endpoint=api.live.ticks");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^Subscribe/ })));
    const rid = useStudioStore.getState().playgroundHistory[0]?.rid ?? "";
    await settle(() => fireEvent.keyDown(document, { key: "Enter", metaKey: true }));

    expect(execCalls()).toEqual([expect.objectContaining({ method: "ticks", transport: "sse" })]);
    expect(useStudioStore.getState().playgroundHistory).toHaveLength(1);
    expect(emit).toHaveBeenCalledWith("playground:exec:cancel", { rid });
  });

  it("subscribes to a stream, and unsubscribes", async () => {
    await openShell("/playground?endpoint=api.live.ticks");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^Subscribe/ })));

    expect(execCalls()[0]).toMatchObject({
      source: "api",
      group: "live",
      method: "ticks",
      transport: "sse",
    });
    const rid = useStudioStore.getState().playgroundHistory[0]?.rid ?? "";
    await settle(() =>
      useStudioStore.getState().appendPlaygroundChunk(rid, { kind: "sse-event", event: { n: 1 } }),
    );
    expect(within(response()).getByText("Streaming")).toBeTruthy();
    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^Unsubscribe/ })));
    expect(emit).toHaveBeenCalledWith("playground:exec:cancel", { rid });
    expect(screen.getByRole("button", { name: /^Subscribe/ })).toBeTruthy();
  });

  it("copies the call as cURL with the headers as typed", async () => {
    usePlaygroundDrafts.setState({
      variables: { "api.users.create": '{ "name": "Ada" }' },
      headers: '{ "authorization": "Bearer t" }',
    });
    await openShell("/playground?endpoint=api.users.create");

    await settle(() =>
      fireEvent.pointerDown(screen.getByRole("button", { name: /Copy as/ }), {
        button: 0,
        ctrlKey: false,
        pointerType: "mouse",
      }),
    );
    await settle(() => fireEvent.click(screen.getByRole("menuitem", { name: "cURL" })));

    const [code, label] = copied.mock.calls[0] ?? [];
    expect(label).toBe("cURL");
    expect(code).toContain("-X POST");
    expect(code).toContain("'http://localhost:7501/users'");
    expect(code).toContain("-H 'authorization: Bearer t'");
    expect(code).toContain(`-d '{"name":"Ada"}'`);
  });

  /* After the menu test: a Radix popover opened and closed here leaves a later test's menu in jsdom closing as it opens. */
  it("sends with ⌘↵, and brings a recent send back", async () => {
    const router = await openShell("/playground?endpoint=api.users.create");

    await settle(() => fireEvent.keyDown(document, { key: "Enter", metaKey: true }));
    expect(execCalls()).toHaveLength(1);
    await settle(() =>
      router.navigate({ to: "/playground", search: { endpoint: "api.users.search" } }),
    );
    await settle(() => fireEvent.click(screen.getByRole("button", { name: /History/ })));
    await settle(() => fireEvent.click(screen.getByRole("button", { name: /users\.create/ })));

    expect(router.state.location.search).toMatchObject({ endpoint: "api.users.create" });
    expect(useStudioStore.getState().playgroundActiveResponse?.method).toBe("create");
  });

  it("says so when no app is attached", async () => {
    useStudioStore.setState({ bindingSnapshot: { ...BOUND, runtimeCount: 0 } });

    await openShell("/playground");

    expect(screen.getByText("No app attached")).toBeTruthy();
  });

  it("offers the sources the config declares, under their names, not the one traffic reported", async () => {
    useStudioStore.setState({ requests: [trafficRequest()] });
    await openShell("/playground?endpoint=api.users.byId");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^Send/ })));

    expect(execCalls()).toEqual([
      expect.objectContaining({ source: "api", group: "users", method: "byId" }),
    ]);
    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^Endpoint:/ })));
    expect(screen.getByPlaceholderText("Search 6 endpoints…")).toBeTruthy();
    expect(screen.queryByText("localhost")).toBeNull();
  });
});

/**
 * @vitest-environment jsdom
 *
 * The Explorer in the new shell: the project's sources, groups and
 * endpoints on a graph coloured by a metric kept in the address, a group
 * opening the Endpoints list narrowed to it, the list's kinds and counts,
 * an endpoint's panel with its calls under the inspector, the overview's
 * figures, the heatmap, and what it says before any endpoint is known.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EndpointAnalysis,
  ScannedEndpoint,
  ScannedSource,
} from "@/features/apis/types-generate";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";
import { requestEntry } from "./request-entry-fixture";
import { openShell } from "./shell-harness";

vi.mock("@/socket", () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn(), connect: vi.fn() }),
}));

const NOW = Date.now();

function endpoint(name: string, analysis: Partial<EndpointAnalysis> = {}): ScannedEndpoint {
  return {
    name,
    analysis: {
      hasResponseType: true,
      hasVariablesType: true,
      hasValidation: true,
      httpMethod: "get",
      path: "/",
      type: "query",
      ...analysis,
    },
  };
}

function source(name: string, groups: ScannedSource["groups"]): ScannedSource {
  return {
    name,
    baseURL: `https://${name}.example.com`,
    filePath: `src/${name}.ts`,
    groups,
    isImported: false,
    hasClient: true,
  };
}

const SOURCES: ScannedSource[] = [
  source("api", [
    {
      name: "orders",
      prefix: "/orders",
      filePath: "src/api.ts",
      endpoints: [
        endpoint("create", {
          httpMethod: "post",
          path: "",
          type: "mutation",
          middleware: ["auth", "logger"],
        }),
        endpoint("list"),
      ],
    },
    {
      name: "events",
      prefix: "/events",
      filePath: "src/api.ts",
      endpoints: [endpoint("subscribe", { transport: "sse", path: "" })],
    },
  ]),
  source("billing", [
    {
      name: "invoices",
      prefix: "/invoices",
      filePath: "src/billing.ts",
      endpoints: [endpoint("get", { path: "/:id", hasResponseType: false })],
    },
  ]),
];

function call(
  id: string,
  group: string,
  method: string,
  fields: Partial<RequestEntry>,
): RequestEntry {
  return requestEntry({ id, source: "api", group, method, ...fields });
}

const REQUESTS: RequestEntry[] = [
  call("c1", "orders", "create", {
    httpMethod: "POST",
    statusCode: 201,
    mode: "proxy",
    startedAt: NOW - 2_000,
    timing: { total: 180, middleware: 10, fetch: 165, validation: 5 },
  }),
  call("c2", "orders", "create", {
    httpMethod: "POST",
    status: "error",
    statusCode: 500,
    startedAt: NOW - 20_000,
    timing: { total: 900, middleware: 10, fetch: 885, validation: 5 },
  }),
  call("l1", "orders", "list", { startedAt: NOW - 30_000 }),
  call("s1", "events", "subscribe", {
    transport: "sse",
    streamStatus: "streaming",
    startedAt: NOW - 40_000,
  }),
];

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

const region = (name: string) => screen.getByRole("region", { name });
const panel = () => screen.queryByRole("complementary", { name: "Endpoint" });
const rowsOf = (list: HTMLElement) => within(list).getAllByRole("button");
const rowWith = (list: HTMLElement, text: string) => {
  const row = rowsOf(list).find((button) => button.textContent?.includes(text));
  if (!row) throw new Error(`no row with ${text}`);
  return row;
};

beforeEach(() => {
  /* The figures count calls by how long ago they came: the clock stands at
     the moment the calls are dated from, however slowly the file runs. */
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    scanSources: SOURCES,
    requests: REQUESTS,
    heldRequests: [],
    paused: false,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the Explorer's graph", () => {
  it("draws every source, group and endpoint with its health and figure", async () => {
    await openShell("/explorer");

    const graph = region("Endpoint graph");
    expect(within(graph).getByText("Sources · 2")).toBeTruthy();
    expect(within(graph).getByText("Groups · 3")).toBeTruthy();
    expect(within(graph).getByText("Endpoints · 4")).toBeTruthy();
    expect(
      within(graph).getByRole("button", {
        name: /^api\.orders\.create · POST \/orders · Critical · Calls [\d.]+\/m, p50 \S+, p95 900ms, Errors 50\.0%$/,
      }),
    ).toBeTruthy();
    expect(
      within(graph).getByRole("button", {
        name: "billing.invoices.get · GET /invoices/:id · No traffic · —",
      }),
    ).toBeTruthy();
  });

  it("runs each call that ends along its endpoint's branch, coloured by how it went", async () => {
    await openShell("/explorer");
    const graph = region("Endpoint graph");
    expect(graph.querySelectorAll("[data-pulse]")).toHaveLength(0);

    await settle(() =>
      useStudioStore.setState({
        requests: [
          call("c9", "orders", "create", {
            httpMethod: "POST",
            status: "error",
            statusCode: 500,
            startedAt: NOW,
          }),
          ...REQUESTS,
        ],
      }),
    );

    expect(graph.querySelectorAll('[data-pulse="err"]')).toHaveLength(1);
    expect(within(graph).queryByText("Live call")).toBeNull();
    expect(screen.getByText("Live call")).toBeTruthy();
  });

  it("runs the calls on a layer of their own, which drawing them leaves the curves out of", async () => {
    await openShell("/explorer");
    const graph = region("Endpoint graph");

    await settle(() =>
      useStudioStore.setState({
        requests: [
          call("c9", "orders", "create", { httpMethod: "POST", startedAt: NOW }),
          ...REQUESTS,
        ],
      }),
    );

    const pulse = graph.querySelector("[data-pulse]");
    const curve = graph.querySelector('path[fill="none"][stroke-width="1.25"]');
    expect(curve?.closest("svg")).not.toBeNull();
    expect(pulse?.closest("svg")).not.toBeNull();
    expect(pulse?.closest("svg")).not.toBe(curve?.closest("svg"));
  });

  it("shows a node's whole address and figures while it is hovered", async () => {
    await openShell("/explorer");
    const card = screen.getByRole("button", { name: /^api · https:\/\/api\.example\.com · / });

    await settle(() => fireEvent.mouseEnter(card));

    expect(within(card).getByText("https://api.example.com")).toBeTruthy();
    expect(within(card).getByText("p95")).toBeTruthy();
    await settle(() => fireEvent.mouseLeave(card));
    expect(within(card).queryByText("p95")).toBeNull();
  });

  it("colours by another metric, kept in the address", async () => {
    const router = await openShell("/explorer");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: "Errors" })));

    expect(router.state.location.search).toMatchObject({ metric: "errors" });
    expect(screen.getByRole("button", { name: /^api\.orders\.create · / }).textContent).toContain(
      "50.0%",
    );
  });

  it("opens the Endpoints list narrowed to a group, and an endpoint's panel", async () => {
    const router = await openShell("/explorer");

    await settle(() => fireEvent.click(screen.getByRole("button", { name: /^api\.orders · / })));

    expect(router.state.location.pathname).toBe("/explorer/endpoints");
    expect(router.state.location.search).toMatchObject({ q: "api.orders." });
    expect(rowsOf(region("Endpoints"))).toHaveLength(2);
  });
});

describe("the Endpoints list", () => {
  it("narrows to a kind and counts what it shows", async () => {
    await openShell("/explorer/endpoints?kind=stream");

    expect(rowsOf(region("Endpoints"))).toHaveLength(1);
    expect(screen.getByText(/never called$/).textContent).toBe("1 endpoint · 0 never called");
  });

  it("tags each endpoint with its kind, proxy and an undeclared response", async () => {
    await openShell("/explorer/endpoints");

    const list = region("Endpoints");
    expect(rowWith(list, "orders.create").textContent).toMatch(/mutation.*proxy.*auth.*logger/);
    expect(rowWith(list, "invoices.get").textContent).toContain("untyped response");
  });

  it("keeps its search across the tabs", async () => {
    const router = await openShell("/explorer/endpoints?q=orders");

    await settle(() => fireEvent.click(screen.getByRole("link", { name: "Overview" })));

    expect(router.state.location.pathname).toBe("/explorer/overview");
    expect(router.state.location.search).toMatchObject({ q: "orders" });
  });
});

describe("an endpoint's panel", () => {
  it("opens from its row with its figures and calls, and closes with Esc", async () => {
    const router = await openShell("/explorer/endpoints");

    await settle(() => fireEvent.click(rowWith(region("Endpoints"), "orders.create")));

    const sheet = panel();
    expect(router.state.location.search).toMatchObject({ endpoint: "api.orders.create" });
    expect(sheet && within(sheet).getByText("https://api.example.com/orders")).toBeTruthy();
    expect(sheet && within(sheet).getByText("Recent calls")).toBeTruthy();
    await settle(() => fireEvent.keyDown(window, { key: "Escape" }));
    expect(router.state.location.search).not.toHaveProperty("endpoint");
    expect(panel()).toBeNull();
  });

  it("opens a call in the inspector over it, Esc closing the inspector first", async () => {
    const router = await openShell("/explorer/endpoints?endpoint=api.orders.create");
    const sheet = panel();
    if (!sheet) throw new Error("the panel did not open");

    await settle(() => fireEvent.click(rowWith(sheet, "201")));

    expect(router.state.location.search).toMatchObject({
      endpoint: "api.orders.create",
      req: "c1",
    });
    expect(screen.getByRole("complementary", { name: "Request inspector" })).toBeTruthy();
    await settle(() => fireEvent.keyDown(window, { key: "Escape" }));
    expect(router.state.location.search).toMatchObject({ endpoint: "api.orders.create" });
    expect(router.state.location.search).not.toHaveProperty("req");
    await settle(() => fireEvent.keyDown(window, { key: "Escape" }));
    expect(router.state.location.search).not.toHaveProperty("endpoint");
  });

  it("links to the endpoint's calls in the Timeline and to the Playground", async () => {
    await openShell("/explorer?endpoint=api.orders.create");
    const sheet = panel();
    if (!sheet) throw new Error("the panel did not open");

    expect(within(sheet).getByRole("link", { name: "View in Timeline" }).getAttribute("href")).toBe(
      "/timeline?q=api.orders.create",
    );
    expect(
      within(sheet).getByRole("link", { name: "Open in Playground" }).getAttribute("href"),
    ).toBe("/playground?endpoint=api.orders.create");
  });
});

describe("the overview", () => {
  it("gives six figures over the project's API surface", async () => {
    await openShell("/explorer/overview");

    const figure = (label: string) =>
      within(region("Figures")).getByText(label).parentElement?.textContent;
    expect(figure("Endpoints")).toBe("Endpoints41 never called");
    expect(figure("Active now")).toBe("Active now2called in last 6s");
    expect(figure("Healthy")).toBe("Healthy67%of called endpoints");
    expect(figure("Error rate")).toBe("Error rate25.0%1 failed call");
  });

  it("opens a group's endpoints from the matrix and a call from the activity", async () => {
    const router = await openShell("/explorer/overview");

    await settle(() => fireEvent.click(rowsOf(region("Activity"))[0] ?? document.body));
    expect(router.state.location.search).toMatchObject({ req: "c1" });
    await settle(() => fireEvent.click(rowWith(region("Health matrix"), "orders")));
    expect(router.state.location.pathname).toBe("/explorer/endpoints");
    expect(router.state.location.search).toMatchObject({ q: "api.orders." });
  });
});

describe("the heatmap", () => {
  it("gives each called HTTP endpoint a row of twenty spans", async () => {
    await openShell("/explorer/heatmap");

    expect(screen.getByText(/intervals of/).textContent).toBe(
      "2 endpoints × 20 intervals of 3.00s",
    );
    expect(screen.getByRole("button", { name: /orders\.create/ })).toBeTruthy();
    expect(screen.getByTitle("api.orders.create · 900ms p95")).toBeTruthy();
  });
});

describe("before any endpoint is known", () => {
  it("says so once Studio has loaded a config that declares none", async () => {
    useStudioStore.setState({
      scanSources: [],
      requests: [],
      connectionStatus: "connected",
      configStatus: {
        state: "loaded",
        revision: 1,
        configFile: "courier.config.ts",
        loadedAt: NOW,
      },
    });

    await openShell("/explorer");

    expect(screen.getByText("No endpoints yet")).toBeTruthy();
  });

  it("shows the endpoints loading while Studio has not loaded the config", async () => {
    useStudioStore.setState({
      scanSources: [],
      requests: [],
      connectionStatus: "connected",
      configStatus: { state: "starting", revision: 0 },
    });

    await openShell("/explorer");

    expect(screen.getByRole("status").textContent).toBe("Loading the endpoints");
    expect(screen.queryByText("No endpoints yet")).toBeNull();
  });
});

describe("an API of a thousand endpoints", () => {
  it("draws only the rows in view, however many endpoints the list holds", async () => {
    const endpoints = Array.from({ length: 1_000 }, (_, i) => endpoint(`get${i}`));
    useStudioStore.setState({
      scanSources: [
        source("big", [{ name: "items", prefix: "/items", filePath: "src/big.ts", endpoints }]),
      ],
      requests: [],
    });

    await openShell("/explorer/endpoints");
    const list = region("Endpoints");
    const drawn = within(list).getAllByRole("button", { name: /items\.get\d+\// });

    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.length).toBeLessThan(100);
    expect(within(list).queryByRole("button", { name: /items\.get999\// })).toBeNull();
  });
});

/**
 * The live views: the latest requests a Studio recorded, newest first, or
 * the failed ones alone, a monorepo's projects apart; the mocks, each
 * scenario under its mock with the one in force marked and the others a
 * click away; and the changes to a mock, made with the project's token,
 * Studio's refusal said in words a person acts on.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { registerLiveCommands } from "../src/live/live-commands";
import { createMocksView, type MockNode } from "../src/live/mocks-view";
import { createRequestsView, type RequestNode } from "../src/live/requests-view";
import type { RecordedRequest, StudioMock } from "../src/studio/live-types";
import { asked, registered } from "./vscode-stand-in";

const STUDIO = "http://localhost:6280";
const shop = { root: "/work/shop", name: "shop", workspace: "/work" };
const admin = { root: "/work/admin", name: "admin", workspace: "/work" };
const REQUEST: RecordedRequest = {
  id: "r2",
  source: "shop",
  endpoint: "orders.place",
  method: "POST",
  mode: "proxy",
  state: "error",
  status: 500,
  durationMs: 40,
  startedAt: 1_000,
  error: "Ledger unavailable",
};
const MOCK: StudioMock = {
  id: "shop",
  name: "shop",
  source: "shop",
  status: "running",
  url: "http://localhost:7101",
  scenarios: [{ name: "default" }, { name: "empty", description: "No products" }],
  activeScenario: "default",
  latency: "3g",
  chaos: "none",
};

describe("the Requests view", () => {
  it("lists one Studio's latest requests, and the failed ones alone when asked", async () => {
    const asks: unknown[] = [];
    const view = createRequestsView(
      async () => [{ project: shop, studio: STUDIO }],
      async (_studio, wanted) => {
        asks.push(wanted);
        return [REQUEST];
      },
    );

    const [row] = (await view.getChildren()) ?? [];
    view.failedOnly(true);
    await view.getChildren();
    const item = view.getTreeItem(row as RequestNode) as { description: string; label: string };

    expect(item.label).toBe("orders.place");
    expect(item.description).toMatch(/^POST · 500 · 40 ms · /);
    expect(asks).toEqual([
      { failed: false, limit: 50 },
      { failed: true, limit: 50 },
    ]);
  });

  it("lists a monorepo's projects apart, and says when nothing came yet", async () => {
    const view = createRequestsView(
      async () => [
        { project: shop, studio: STUDIO },
        { project: admin, studio: "http://localhost:6290" },
      ],
      async () => [],
    );

    const projects = (await view.getChildren()) ?? [];
    const [note] = (await view.getChildren(projects[0])) ?? [];

    expect(projects.map((node) => node.kind)).toEqual(["project", "project"]);
    expect(note).toMatchObject({ kind: "note", text: expect.stringContaining("No request yet") });
  });
});

describe("the Mocks view", () => {
  it("lists each mock's scenarios, the one in force marked and the others a click away", async () => {
    const view = createMocksView(
      async () => [{ project: shop, studio: STUDIO }],
      async () => [MOCK],
    );

    const [mock] = (await view.getChildren()) ?? [];
    const scenarios = (await view.getChildren(mock)) ?? [];
    const items = scenarios.map(
      (node) => view.getTreeItem(node) as { command?: unknown; description: string },
    );
    const mockItem = view.getTreeItem(mock as MockNode) as {
      description: string;
      contextValue: string;
    };

    expect(mockItem.description).toBe("running · localhost:7101 · delay 3g");
    expect(mockItem.contextValue).toBe("courier.mock.faulty");
    expect(items[0]?.command).toBeUndefined();
    expect(items[0]?.description).toBe("in force");
    expect(items[1]?.command).toMatchObject({ command: "courier.mock.scenario" });
  });
});

describe("a change to a mock", () => {
  let studio: Server;
  let address: string;
  const seen: { path: string | undefined; token: string | undefined; body: unknown }[] = [];
  let refuse = false;

  beforeAll(async () => {
    studio = createServer((req: IncomingMessage, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        seen.push({
          path: req.url,
          token: req.headers["x-courier-studio-token"] as string | undefined,
          body: JSON.parse(body),
        });
        res.statusCode = refuse ? 401 : 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(refuse ? { error: "token" } : {}));
      });
    });
    await new Promise<void>((resolve) => studio.listen(0, "127.0.0.1", resolve));
    address = `http://127.0.0.1:${(studio.address() as AddressInfo).port}`;
  });
  afterAll(() => studio.close());

  it("switches a scenario and sets a delay with the project's token", async () => {
    let redrawn = 0;
    const commands = registerLiveCommands({
      requests: { refreshed: () => undefined, failedOnly: () => undefined } as never,
      mocks: { refreshed: () => (redrawn += 1) } as never,
      open: async () => undefined,
      tokenFor: async () => "t".repeat(43),
    });
    const node = { kind: "scenario", studio: address, mock: MOCK, scenario: { name: "empty" } };

    await registered.get("courier.mock.scenario")?.(node);
    asked.picks.push("satellite");
    await registered.get("courier.mock.delay")?.({ kind: "mock", studio: address, mock: MOCK });
    commands.dispose();

    expect(seen).toEqual([
      {
        path: "/api/editor/mocks/scenario",
        token: "t".repeat(43),
        body: { mock: "shop", scenario: "empty" },
      },
      {
        path: "/api/editor/mocks/conditions",
        token: "t".repeat(43),
        body: { mock: "shop", latency: "satellite" },
      },
    ]);
    expect(redrawn).toBe(2);
  });

  it("says why, in words a person acts on, when Studio refuses for want of the token", async () => {
    refuse = true;
    asked.errors.length = 0;
    const commands = registerLiveCommands({
      requests: {} as never,
      mocks: { refreshed: () => undefined } as never,
      open: async () => undefined,
      tokenFor: async () => undefined,
    });

    await registered.get("courier.mock.stopFaults")?.({
      kind: "mock",
      studio: address,
      mock: MOCK,
    });
    commands.dispose();

    expect(asked.errors).toEqual([expect.stringContaining("only with the project's token")]);
  });
});

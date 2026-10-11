/**
 * The actions on the Courier view's rows open the page each row names in
 * Studio: the endpoint, its failed calls in the Timeline, its latest failure
 * in the inspector, a project's Studio itself.
 */
import { afterEach, describe, expect, it } from "vitest";

import type { CourierProjects } from "../src/projects/courier-projects";
import type { EndpointStats } from "../src/studio/studio-types";
import { registerViewCommands } from "../src/view/view-commands";
import { registered, shown } from "./vscode-stand-in";

const STUDIO = "http://localhost:6280";
const stats: EndpointStats = {
  source: "shop",
  endpoint: "orders.place",
  calls: 3,
  failed: 1,
  pending: 0,
  statuses: {},
  lastFailure: { at: 1, status: 500, message: "boom", request: "req_7" },
};
const endpoint = { kind: "endpoint", studio: STUDIO, stats } as const;
const project = { root: "/work/shop", name: "shop", workspace: "/work" };

async function run(command: string, node: unknown): Promise<string[]> {
  const commands = registerViewCommands(
    {} as CourierProjects,
    async () => undefined,
    async (page) => {
      shown.opened.push(page);
    },
  );
  await registered.get(command)?.(node);
  commands.dispose();
  return shown.opened.splice(0);
}

afterEach(() => {
  shown.opened.length = 0;
});

describe("the actions on the Courier view's rows", () => {
  it("opens an endpoint, its failed calls and its latest failure in Studio", async () => {
    expect(await run("courier.view.openInStudio", endpoint)).toEqual([
      `${STUDIO}/explorer/endpoints?endpoint=shop.orders.place`,
    ]);
    expect(await run("courier.view.showFailures", endpoint)).toEqual([
      `${STUDIO}/timeline?view=errors&source=shop&q=orders.place`,
    ]);
    expect(await run("courier.view.openLatestFailure", endpoint)).toEqual([
      `${STUDIO}/timeline?req=req_7`,
    ]);
  });

  it("opens a running project's Studio, and nothing for a row that names no page", async () => {
    expect(
      await run("courier.view.openInStudio", { kind: "project", project, studio: STUDIO }),
    ).toEqual([STUDIO]);
    expect(await run("courier.view.openInStudio", { kind: "note", id: "n", text: "x" })).toEqual(
      [],
    );
    expect(
      await run("courier.view.openLatestFailure", {
        ...endpoint,
        stats: { ...stats, lastFailure: undefined },
      }),
    ).toEqual([]);
  });
});

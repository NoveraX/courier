/**
 * @vitest-environment jsdom
 *
 * Where the Explorer names the reads another call's request answered: a
 * group's chip says how many calls and requests it stands for, an
 * endpoint's panel counts its requests beside its calls, and the lists of
 * calls — an endpoint's newest and the Overview's activity — mark each.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { recentCalls } from "@/features/explorer/endpoint-detail";
import { explorerModelOf } from "@/features/explorer/explorer-model";
import { CallRow } from "@/request-list/call-row";
import { ActivityFeed } from "@/screens/explorer/activity-feed";
import { EndpointFigures } from "@/screens/explorer/endpoint-figures";
import { HealthMatrix } from "@/screens/explorer/health-matrix";
import type { Catalog } from "@/store/types";
import { requestEntry } from "./request-entry-fixture";

const NOW = 1_000_000;

const CATALOG: Catalog = {
  api: {
    baseURL: "https://api.example.com",
    groups: {
      users: {
        prefix: "/users",
        endpoints: {
          list: {
            type: "query",
            hasVariablesSchema: true,
            hasResponseSchema: true,
            origin: "scan",
          },
        },
      },
    },
  },
};

/* Newest first, as the store holds them: a read that joined the one before it. */
const CALLS = [
  requestEntry({ id: "joined", startedAt: NOW - 1_000, shared: { by: "flight", with: "sent" } }),
  requestEntry({ id: "sent", startedAt: NOW - 2_000 }),
];

const model = explorerModelOf(CATALOG, CALLS, NOW, 500);

function users() {
  const [endpoint] = model.endpoints;
  if (!endpoint) throw new Error("no endpoint");
  return endpoint;
}

afterEach(cleanup);

describe("the reads another call's request answered, in the Explorer", () => {
  it("are counted beside the requests on a group's chip", () => {
    render(<HealthMatrix model={model} onGroup={vi.fn()} />);

    expect(screen.getByTitle(/ · 2 calls · 1 request · 0\.0% errors · p95 /)).toBeTruthy();
  });

  it("leave an endpoint's panel saying how many requests its calls sent", () => {
    render(<EndpointFigures endpoint={users()} slowMs={500} />);

    expect(screen.getByText("· 1 request")).toBeTruthy();
  });

  it("leave an endpoint whose every read another call's request answered with no error rate", () => {
    const [endpoint] = explorerModelOf(CATALOG, CALLS.slice(0, 1), NOW, 500).endpoints;
    if (!endpoint) throw new Error("no endpoint");
    render(<EndpointFigures endpoint={endpoint} slowMs={500} />);

    expect(screen.getByText("Errors").nextElementSibling?.textContent).toBe("—");
  });

  it("are marked in an endpoint's newest calls, and the call that sent its own is not", () => {
    render(
      <div>
        {recentCalls(users()).map((call) => (
          <CallRow key={call.request.id} call={call} slowMs={500} onOpen={vi.fn()} />
        ))}
      </div>,
    );

    const [joined, sent] = screen.getAllByRole("button");
    const marks = within(joined ?? document.body).getAllByText("shared");
    /* Beside the bar while the row has room for it, beside when it began once it has not. */
    expect(marks.map((mark) => mark.parentElement?.className)).toEqual([
      expect.stringContaining("@max-[18rem]:inline-flex"),
      expect.stringContaining("@max-[18rem]:hidden"),
    ]);
    expect(within(sent ?? document.body).queryByText("shared")).toBeNull();
  });

  it("are marked in the Overview's activity", () => {
    render(<ActivityFeed requests={CALLS} now={NOW} slowMs={500} live onOpen={vi.fn()} />);

    const [joined, sent] = screen.getAllByRole("button");
    expect(within(joined ?? document.body).getByText("shared")).toBeTruthy();
    expect(within(sent ?? document.body).queryByText("shared")).toBeNull();
  });
});

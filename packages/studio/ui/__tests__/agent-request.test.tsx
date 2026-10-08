/**
 * @vitest-environment jsdom
 *
 * A call an MCP server made for an agent, in Studio: kept from its event and
 * from a saved session with the tool and the client, chosen by the Mode
 * filter and found by search, and marked in its Timeline row — while the
 * application's own calls carry none of it.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { requestProperties } from "@/features/requests/request-properties";
import { dimensionValue, matchesFilter, OPEN_FILTER } from "@/features/requests/timeline-filter";
import { requestFromSaved } from "@/features/sessions/saved-request";
import { RequestRow } from "@/screens/timeline/request-row";
import { requestFromStart } from "@/store/handle-request-events";
import { requestEntry } from "./request-entry-fixture";

const start = {
  id: "r1",
  type: "request:start",
  source: "shop",
  group: "orders",
  method: "cancel",
  mode: "direct",
  middlewareCount: 1,
  timestamp: 1,
};
const agent = {
  tool: "orders_cancel",
  access: "destructive",
  client: "code-editor 2.1.0",
} as const;

describe("an agent's call", () => {
  it("keeps the tool and the client from its event and from a saved session, and nothing malformed", () => {
    expect(requestFromStart({ ...start, agent }).agent).toEqual(agent);
    expect(requestFromSaved({ ...start, startedAt: 1, agent }).agent).toEqual(agent);
    expect(requestFromStart(start).agent).toBeUndefined();
    expect(
      requestFromStart({ ...start, agent: { tool: "x", access: "admin" } }).agent,
    ).toBeUndefined();
  });

  it("is chosen by the Mode filter as Agent, and found by its tool and its client", () => {
    const fromAgent = requestEntry({ agent });
    const fromApp = requestEntry({});
    const agents = { ...OPEN_FILTER, selected: { ...OPEN_FILTER.selected, mode: ["agent"] } };

    expect([dimensionValue(fromAgent, "mode"), dimensionValue(fromApp, "mode")]).toEqual([
      "agent",
      "direct",
    ]);
    expect([
      matchesFilter(fromAgent, agents, { slowMs: 500 }),
      matchesFilter(fromApp, agents, { slowMs: 500 }),
    ]).toEqual([true, false]);
    expect(
      matchesFilter(fromAgent, { ...OPEN_FILTER, search: "code-editor" }, { slowMs: 500 }),
    ).toBe(true);
    expect(matchesFilter(fromApp, { ...OPEN_FILTER, search: "code-editor" }, { slowMs: 500 })).toBe(
      false,
    );
  });

  it("is marked in its Timeline row, and its tool listed in its properties", () => {
    const context = {
      now: 2,
      timestamps: "relative" as const,
      wide: true,
      slowMs: 500,
      maxDuration: 1,
    };

    render(
      <RequestRow
        request={requestEntry({ agent })}
        selected={false}
        context={context as never}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByTitle("Agent tool orders_cancel · code-editor 2.1.0").textContent).toBe(
      "agent",
    );
    expect(requestProperties(requestEntry({ agent }), {})).toContainEqual({
      label: "Agent tool",
      value: "orders_cancel · destructive",
      mono: true,
    });
    expect(requestProperties(requestEntry({}), {}).map((property) => property.label)).not.toContain(
      "Agent tool",
    );
  });
});

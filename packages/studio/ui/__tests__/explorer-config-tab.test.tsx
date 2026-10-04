/**
 * @vitest-environment jsdom
 *
 * An endpoint's Config tab in the Explorer says what the definition
 * declares: the verb it addresses the endpoint with, and, for a stream or a
 * channel, which of the two it is.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ConfigTab } from "@/views/explorer/detail/tabs/config-tab";
import type { EndpointNodeData } from "@/views/explorer/types";

function endpoint(overrides: Partial<EndpointNodeData>): EndpointNodeData {
  return {
    source: "api",
    group: "users",
    method: "get",
    fullPath: "/users/:id",
    httpMethod: "GET",
    endpointType: "query",
    hasVariablesSchema: true,
    hasResponseSchema: true,
    middleware: [],
    metrics: {
      totalRequests: 0,
      successRate: 0,
      avgResponseTime: 0,
      p95ResponseTime: 0,
      errorCount: 0,
      avgSize: 0,
      lastRequestAt: null,
      isActive: false,
    },
    ...overrides,
  };
}

afterEach(cleanup);

describe("an endpoint's Config tab", () => {
  it("names the verb the definition declares, not one guessed from the endpoint's name", () => {
    render(<ConfigTab endpoint={endpoint({})} />);

    expect(screen.getByText(/as the definition declares it/)).toBeTruthy();
    expect(screen.queryByText(/inferred from endpoint name/)).toBeNull();
  });

  it("names a stream as one", () => {
    render(
      <ConfigTab
        endpoint={endpoint({ method: "ticks", endpointType: "untyped", transport: "sse" })}
      />,
    );

    expect(screen.getByText("stream")).toBeTruthy();
    expect(screen.getByText(/a stream opens with a GET/)).toBeTruthy();
    expect(screen.queryByText("untyped")).toBeNull();
  });

  it("names a channel as one", () => {
    render(
      <ConfigTab
        endpoint={endpoint({ method: "room", endpointType: "untyped", transport: "ws" })}
      />,
    );

    expect(screen.getByText("channel")).toBeTruthy();
    expect(screen.getByText("A WebSocket subscription")).toBeTruthy();
  });
});

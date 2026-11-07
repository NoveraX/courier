/**
 * The handlers the routes give are what a TanStack Start route takes as its
 * `server.handlers`, by TanStack's own types: this file compiles only while
 * they are. A route is made here as an application's is, beside a root.
 */
import { createRootRoute, createRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { describe, expect, it } from "vitest";

import { apiRoute, sseRoute } from "../src/index";

describe("the routes' handlers", () => {
  it("are what a TanStack Start route takes for its server", () => {
    const root = createRootRoute();
    const request = createRoute({
      getParentRoute: () => root,
      path: "/api/request",
      server: { handlers: apiRoute() },
    });
    const streams = createRoute({
      getParentRoute: () => root,
      path: "/api/sse",
      server: { handlers: sseRoute() },
    });

    expect(Object.keys(request.options.server?.handlers ?? {})).toEqual([
      "GET",
      "POST",
      "OPTIONS",
      "ANY",
    ]);
    expect(Object.keys(streams.options.server?.handlers ?? {})).toEqual(["GET", "OPTIONS", "ANY"]);
  });
});

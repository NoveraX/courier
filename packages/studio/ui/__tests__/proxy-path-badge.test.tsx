/**
 * @vitest-environment jsdom
 */
/**
 * The Playground names the proxy path a call goes to. A source that declares
 * none is called at the default path, as a proxy caller calls it, and the
 * badge shows that path, not "not configured" in amber while the call goes
 * through. Only a WebSocket, which has no default, is not configured.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { CatalogEntry } from "../src/store/types-ui";
import { ProxyPathBadge } from "../src/views/playground/proxy-path-badge";

afterEach(() => {
  cleanup();
});

const SOURCE: CatalogEntry = {
  baseURL: "https://api.example",
  appOrigin: "http://localhost:3000",
  groups: {},
};

function badge(transport: "http" | "sse" | "ws", source: CatalogEntry = SOURCE) {
  render(
    <TooltipProvider>
      <ProxyPathBadge transport={transport} source={source} />
    </TooltipProvider>,
  );
}

describe("the proxy path badge of a source that declares no proxyPath", () => {
  it("shows the default HTTP path on the app's origin", () => {
    badge("http");

    expect(screen.getByText("http://localhost:3000/api/request")).toBeTruthy();
    expect(screen.queryByText("not configured")).toBeNull();
  });

  it("shows the default stream path", () => {
    badge("sse");

    expect(screen.getByText("http://localhost:3000/api/sse")).toBeTruthy();
  });

  it("says a WebSocket is not configured, having no default", () => {
    badge("ws");

    expect(screen.getByText("not configured")).toBeTruthy();
  });
});

describe("the proxy path badge of a source that declares one", () => {
  it("shows the declared path", () => {
    badge("http", { ...SOURCE, proxyPath: { http: "/courier" } });

    expect(screen.getByText("http://localhost:3000/courier")).toBeTruthy();
  });
});

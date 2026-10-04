/**
 * @vitest-environment jsdom
 *
 * The note above a direct request's headers names what added the headers
 * Studio cannot list: the browser for a browser runtime, the HTTP client for
 * a server one — which has no DevTools to point at.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HeadersTab } from "@/components/shared/detail-panel/tabs/headers-tab";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useStudioStore } from "@/store";
import type { RequestEntry } from "@/store/types";

const REQUEST: RequestEntry = {
  id: "r1",
  source: "api",
  group: "users",
  method: "list",
  variables: undefined,
  mode: "direct",
  status: "success",
  middlewareCount: 0,
  middlewareEntries: [],
  hasValidation: { variables: false, response: false },
  startedAt: 1,
  headers: { "content-type": "application/json" },
  sessionId: "demo-server",
};

function attached(kind: "browser" | "server" | null): void {
  useStudioStore.setState({
    bindingSnapshot: {
      rows: [],
      runtimeCount: kind ? 1 : 0,
      sourceCount: kind ? 1 : 0,
      runtimes: kind ? [{ runtimeId: "demo-server", kind }] : [],
    },
  });
}

afterEach(cleanup);

describe("the note above a direct request's headers", () => {
  it("names the HTTP client for a request a server runtime sent", () => {
    attached("server");
    render(
      <TooltipProvider>
        <HeadersTab request={REQUEST} />
      </TooltipProvider>,
    );

    expect(screen.getByText(/the HTTP client adds as it sends/)).toBeTruthy();
    expect(screen.queryByText(/DevTools/)).toBeNull();
  });

  it("names the browser for a request a browser runtime sent", () => {
    attached("browser");
    render(
      <TooltipProvider>
        <HeadersTab request={REQUEST} />
      </TooltipProvider>,
    );

    expect(screen.getByText(/DevTools Network panel/)).toBeTruthy();
  });

  it("names neither when the runtime is gone", () => {
    attached(null);
    render(
      <TooltipProvider>
        <HeadersTab request={REQUEST} />
      </TooltipProvider>,
    );

    expect(screen.getByText(/the browser or the HTTP client adds as it sends/)).toBeTruthy();
  });
});

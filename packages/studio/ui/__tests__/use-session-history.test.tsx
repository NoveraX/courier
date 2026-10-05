/**
 * @vitest-environment jsdom
 */
/**
 * Settings' session history against a running Studio: saving the requests
 * on screen, listing what was saved, and loading a saved session back into
 * the Timeline: Save sends the requests with the name, the list shows what
 * Studio saved, Load fills the Timeline and pauses recording, and a session
 * that cannot be loaded says why rather than failing as an uncaught
 * error.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";

import { act, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const studio = vi.hoisted(() => ({ url: "", token: "" }));

/* The UI's client posts to its own origin; here that origin is a Studio
   server started for the test, reached with the Origin header its page sends
   and the token of the link it was opened from. */
vi.mock("@/lib/api-client", async () => {
  const { StudioRequestError } = await import("@/lib/studio-request-error");
  return {
    post: async (path: string, body?: unknown) => {
      const response = await fetch(`${studio.url}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: studio.url,
          "x-courier-studio-token": studio.token,
        },
        body: JSON.stringify(body ?? {}),
      });
      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok) throw new StudioRequestError(String(data.error), data, undefined);
      return data;
    },
  };
});

import { useSessionHistory } from "@/settings/use-session-history";
import type { RequestEntry } from "@/store";
import { useStudioStore } from "@/store";
import { createStudioServer } from "../../src/server";

let root = "";
let close: (() => Promise<void>) | undefined;

function entry(id: string, status: RequestEntry["status"]): RequestEntry {
  return {
    id,
    source: "api",
    group: "users",
    method: "list",
    httpMethod: "GET",
    variables: { page: 1 },
    mode: "direct",
    status,
    statusCode: status === "success" ? 200 : 500,
    middlewareCount: 0,
    middlewareEntries: [],
    hasValidation: { variables: false, response: false },
    startedAt: id === "r1" ? 1_000 : 2_000,
    timing: { total: 12, middleware: 1, fetch: 10, validation: 1 },
    data: { users: [] },
    url: "http://api.test/users",
    sessionId: "server",
  };
}

async function freePort(): Promise<number> {
  const probe = createNetServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

async function history() {
  const hook = renderHook(() => useSessionHistory());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

beforeAll(async () => {
  const cache = join(__dirname, "../../../../node_modules/.cache/courier-studio-tests");
  mkdirSync(cache, { recursive: true });
  root = mkdtempSync(join(cache, "sessions-"));
  const port = await freePort();
  studio.url = await new Promise<string>((resolve) => {
    const server = createStudioServer({
      port,
      host: "127.0.0.1",
      projectRoot: root,
      onReady: resolve,
    });
    studio.token = server.token;
    close = () => server.close();
  });
});

afterAll(async () => {
  await close?.();
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  useStudioStore.setState({ requests: [entry("r2", "error"), entry("r1", "success")] });
});

describe("the session history", () => {
  it("saves the requests on screen and lists the saved session", async () => {
    const { result } = await history();

    await act(() => result.current.saveCurrentSession("checkout bug"));

    await waitFor(() => expect(result.current.sessions).toHaveLength(1));
    expect(result.current.sessions[0]).toMatchObject({
      name: "checkout bug",
      stats: { totalRequests: 2, successCount: 1, errorCount: 1 },
    });
  });

  it("loads a saved session into the Timeline", async () => {
    const { result } = await history();
    const saved = result.current.sessions.find((s) => s.name === "checkout bug");
    useStudioStore.setState({ requests: [] });

    await act(() => result.current.loadSession(saved?.id ?? ""));

    const loaded = useStudioStore.getState().requests;
    expect(loaded.map((r) => [r.id, r.status])).toEqual([
      ["r2", "error"],
      ["r1", "success"],
    ]);
    expect(loaded[1]).toMatchObject({
      statusCode: 200,
      data: { users: [] },
      url: "http://api.test/users",
    });
  });

  it("pauses recording once a session is loaded, so live traffic does not mix into it", async () => {
    const { result } = await history();
    const saved = result.current.sessions.find((s) => s.name === "checkout bug");
    useStudioStore.setState({ paused: false });

    await act(() => result.current.loadSession(saved?.id ?? ""));

    expect(useStudioStore.getState().paused).toBe(true);
  });

  it("says why a session could not be loaded", async () => {
    const failed = vi.spyOn(toast, "error");
    const { result } = await history();

    await act(() => result.current.loadSession("missing"));

    expect(failed).toHaveBeenCalledWith(expect.stringContaining("Session not found"));
  });
});

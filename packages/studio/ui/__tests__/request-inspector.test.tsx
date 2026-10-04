/**
 * @vitest-environment jsdom
 *
 * The request inspector over the new shell: the request its address
 * names, on the tab it names or the one that fits — a failure's, a
 * stream's messages — its tabs kept in the address, Esc closing it,
 * credentials hidden until asked, its pin and replay, and a stream's
 * reconnect and stop.
 */
import { playgroundRequestId } from "@noverax/courier-studio-core";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudioStore } from "@/store";
import { requestEntry } from "./request-entry-fixture";
import { openShell } from "./shell-harness";

const socket = vi.hoisted(() => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn(), connect: vi.fn() }));
vi.mock("@/socket", () => ({ getSocket: () => socket }));

const ok = requestEntry({
  id: "ok",
  data: { id: "u_1", name: "Ada" },
  variables: { page: 2 },
  requestHeaders: { accept: "application/json", authorization: "Bearer t0k3n" },
  headers: { "content-type": "application/json" },
});
const failed = requestEntry({
  id: "failed",
  status: "error",
  statusCode: 404,
  error: { type: "http", status: 404, message: "HTTP 404" },
});
const stream = requestEntry({
  id: "stream",
  transport: "ws",
  streamStatus: "streaming",
  streamEventCount: 2,
  streamEvents: [
    {
      seq: 1,
      eventType: "message",
      dataSize: 20,
      dataPreview: '{"type":"join"}',
      timestamp: ok.startedAt + 10,
    },
    {
      seq: 2,
      eventType: "data",
      dataSize: 20,
      dataPreview: '{"type":"welcome"}',
      timestamp: ok.startedAt + 20,
    },
  ],
});

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

const inspector = () => screen.getByRole("complementary", { name: "Request inspector" });

beforeEach(() => {
  socket.emit.mockClear();
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    requests: [ok, failed, stream],
    heldRequests: [],
    paused: false,
  });
});

afterEach(cleanup);

describe("the request inspector", () => {
  it("shows nothing while the address names no request, or one Studio does not hold", async () => {
    await openShell("/next/timeline");
    expect(screen.queryByRole("complementary", { name: "Request inspector" })).toBeNull();

    cleanup();
    await openShell("/next/timeline?req=gone");
    expect(screen.queryByRole("complementary", { name: "Request inspector" })).toBeNull();
  });

  it("opens the request on its overview: the endpoint, the figures, the tabs, the properties and checks", async () => {
    await openShell("/next/timeline?req=ok");
    const panel = within(inspector());

    expect(panel.getByRole("heading", { level: 2 }).textContent).toBe("api.users.list");
    expect(panel.getByText("Success")).toBeTruthy();
    expect(panel.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Overview",
      "Response",
      "Request",
      "Headers3",
      "Timing",
      "Snippets",
    ]);
    expect(panel.getByText("Properties")).toBeTruthy();
    expect(panel.getByText("No input validation")).toBeTruthy();
    expect(panel.queryByText("Variables validated")).toBeNull();
  });

  it("keeps the tab shown in the address, and shows the answer as a tree", async () => {
    const router = await openShell("/next/timeline?req=ok");

    await settle(() => fireEvent.click(within(inspector()).getByRole("tab", { name: "Response" })));

    expect(router.state.location.search).toMatchObject({ req: "ok", tab: "response" });
    expect(within(inspector()).getByText('"Ada"')).toBeTruthy();
  });

  it("closes on Esc", async () => {
    const router = await openShell("/next/timeline?req=ok");

    await settle(() => fireEvent.keyDown(window, { key: "Escape" }));

    expect(router.state.location.search).not.toHaveProperty("req");
  });

  it("leaves the way it came, still showing the request it closes until it has gone", async () => {
    MotionGlobalConfig.skipAnimations = false;
    try {
      const router = await openShell("/next/timeline?req=ok");

      await settle(() => fireEvent.keyDown(window, { key: "Escape" }));

      expect(router.state.location.search).not.toHaveProperty("req");
      expect(within(inspector()).getByRole("heading", { level: 2 }).textContent).toBe(
        "api.users.list",
      );
      await waitFor(() =>
        expect(screen.queryByRole("complementary", { name: "Request inspector" })).toBeNull(),
      );
    } finally {
      MotionGlobalConfig.skipAnimations = true;
    }
  });

  it("opens a failed request on its error, with what usually fixes it", async () => {
    await openShell("/next/timeline?req=failed");
    const panel = within(inspector());

    expect(panel.getByRole("tab", { name: "Error" }).getAttribute("aria-selected")).toBe("true");
    expect(panel.getByText("Suggested fix")).toBeTruthy();
    expect(panel.getByText(/Nothing was found at this URL/)).toBeTruthy();
  });

  it("opens a stream on its messages", async () => {
    await openShell("/next/timeline?req=stream");
    const panel = within(inspector());

    expect(panel.getByRole("tab", { name: "Messages2" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(panel.getByText("join")).toBeTruthy();
    expect(panel.getByText("welcome")).toBeTruthy();
  });

  it("reconnects a stream on the runtime that opened it, and stops it from here", async () => {
    const router = await openShell("/next/timeline?req=stream");
    const panel = within(inspector());
    expect(panel.queryByTitle("Stop the stream")).toBeNull();

    fireEvent.click(panel.getByTitle("Reconnect · the messages it sent are not sent again"));
    const [, sent] = socket.emit.mock.calls.find(([event]) => event === "playground:exec") ?? [];
    const rid = typeof sent === "object" && sent !== null && "rid" in sent ? String(sent.rid) : "";
    const reopened = requestEntry({
      id: playgroundRequestId(rid),
      transport: "ws",
      streamStatus: "streaming",
    });
    await act(async () => useStudioStore.setState({ requests: [ok, failed, stream, reopened] }));
    await settle(() => fireEvent.click(within(inspector()).getByTitle("Stop the stream")));

    expect(sent).toMatchObject({ transport: "ws", runtimeId: stream.sessionId, mode: "direct" });
    expect(router.state.location.search).toMatchObject({ req: reopened.id });
    expect(socket.emit).toHaveBeenCalledWith("playground:exec:cancel", { rid });
  });

  it("hides a credential header's value until asked", async () => {
    await openShell("/next/timeline?req=ok&tab=headers");
    const panel = within(inspector());
    expect(panel.queryByText("Bearer t0k3n")).toBeNull();

    fireEvent.click(panel.getByRole("button", { name: "Show credentials" }));

    expect(panel.getByText("Bearer t0k3n")).toBeTruthy();
  });

  it("writes snippets with the credential left out, and says so", async () => {
    await openShell("/next/timeline?req=ok&tab=snippets");
    const panel = within(inspector());

    expect(panel.getByText("credentials redacted")).toBeTruthy();
    expect(inspector().textContent).not.toContain("t0k3n");
  });

  it("pins the request, and replays it through the app with the same variables", async () => {
    await openShell("/next/timeline?req=ok");
    const panel = within(inspector());

    fireEvent.click(panel.getByTitle("Pin request"));
    fireEvent.click(panel.getByTitle("Replay request"));

    expect(useStudioStore.getState().requests.find((r) => r.id === "ok")?.pinned).toBe(true);
    expect(socket.emit).toHaveBeenCalledWith(
      "playground:exec",
      expect.objectContaining({
        source: "api",
        group: "users",
        method: "list",
        mode: "direct",
        transport: "http",
        variables: { page: 2 },
        runtimeId: ok.sessionId,
      }),
    );
  });

  it("opens a request held while recording pauses", async () => {
    useStudioStore.setState({
      paused: true,
      heldRequests: [requestEntry({ id: "held", method: "held" })],
    });

    await openShell("/next/timeline?req=held");

    expect(within(inspector()).getByRole("heading", { level: 2 }).textContent).toBe(
      "api.users.held",
    );
  });

  it("opens a replay held while recording pauses, once it arrives", async () => {
    useStudioStore.setState({ paused: true });
    const router = await openShell("/next/timeline?req=ok");

    fireEvent.click(within(inspector()).getByTitle("Replay request"));
    const [, sent] = socket.emit.mock.calls.find(([event]) => event === "playground:exec") ?? [];
    const rid = typeof sent === "object" && sent !== null && "rid" in sent ? String(sent.rid) : "";
    const replayed = requestEntry({ id: playgroundRequestId(rid) });
    await act(async () => useStudioStore.setState({ heldRequests: [replayed] }));

    expect(rid).not.toBe("");
    expect(router.state.location.search).toMatchObject({ req: replayed.id });
  });

  it("replays nothing while a saved session shows, and says why", async () => {
    useStudioStore.setState({ shownSession: { id: "s1", name: "Saved" } });

    await openShell("/next/timeline?req=ok");
    const button = within(inspector()).getByTitle("Go back to the live requests to run it again");

    expect(button.hasAttribute("disabled")).toBe(true);
  });
});

/**
 * @vitest-environment jsdom
 *
 * A session file for a bug report: Studio writes it for the requests shown
 * or a saved session, the person looks it over — what was replaced, by
 * request and place, and the environment — and Download saves exactly the
 * file shown. A colleague opens it — picked or dropped — and sees it in
 * place of the live requests, with where it was recorded set beside their
 * own environment.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/socket", () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn(), connect: vi.fn() }),
}));
vi.mock("@/socket/socket-instance", () => ({ getSocket: () => ({ emit: vi.fn() }) }));
vi.mock("@/lib/api-client", () => ({ post: vi.fn(), get: vi.fn(), apiClient: { post: vi.fn() } }));
vi.mock("@/lib/export", () => ({ downloadFile: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast, Toaster: () => null }));

import { openSessionFile } from "@/features/sessions/open-session-file";
import type { SessionEnvironment } from "@/features/sessions/session-environment";
import { environmentLines } from "@/features/sessions/session-environment";
import { prepareSessionFile, sessionFileName } from "@/features/sessions/session-file";
import {
  shareSessionFile,
  useSessionFileDialog,
} from "@/features/sessions/session-file-dialog-store";
import { useSessionFileDrop } from "@/features/sessions/use-session-file-drop";
import { post } from "@/lib/api-client";
import { downloadFile } from "@/lib/export";
import { SessionFileDialog } from "@/screens/session-file/session-file-dialog";
import { OpenedSessionBanner } from "@/screens/timeline/opened-session-banner";
import { useStudioStore } from "@/store";
import { requestEntry } from "./request-entry-fixture";

const ENVIRONMENT: SessionEnvironment = {
  studio: "0.9.0",
  node: "v24.21.0",
  platform: "darwin-arm64",
  packages: { "@noverax/courier": "0.9.0", zod: "4.1.0" },
  definitions: { shop: "sha256:0123456789abcdef" },
};

const FILE = {
  format: "courier-session",
  version: 1,
  exportedAt: 1,
  environment: ENVIRONMENT,
  redactions: ["requests[0].variables.password", "requests[1].url?api_key"],
  session: {
    id: "s1",
    name: "Checkout fails",
    requests: [
      { id: "r1", group: "auth", method: "login", status: "success", statusCode: 200 },
      { id: "r2", method: "orders", status: "error", statusCode: 500 },
    ],
  },
};

const LOADED = {
  id: "s2",
  name: "Checkout fails (opened from a file)",
  requests: [{ id: "r1", source: "shop", method: "login", startedAt: 1, status: "success" }],
  environment: ENVIRONMENT,
};

function answer(routes: Record<string, unknown>): void {
  vi.mocked(post).mockImplementation(async (url: string) => {
    if (!(url in routes)) throw new Error(`unexpected ${url}`);
    const value = routes[url];
    if (value instanceof Error) throw value;
    return value;
  });
}

beforeEach(() => {
  useStudioStore.setState({
    requests: [requestEntry({ id: "a" }), requestEntry({ id: "b" })],
    shownSession: null,
    paused: false,
  });
  useSessionFileDialog.setState({ target: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("writing a session file", () => {
  it("sends the live requests, a shown session by id, or the saved session asked for", async () => {
    answer({ "/api/sessions/file": FILE });

    await prepareSessionFile({ kind: "shown" });
    useStudioStore.setState({ shownSession: { id: "s9", name: "Shown" } });
    await prepareSessionFile({ kind: "shown" });
    await prepareSessionFile({ kind: "saved", id: "s3" });

    const bodies = vi.mocked(post).mock.calls.map(([, body]) => body);
    expect(bodies[0]).toEqual({
      requests: [expect.objectContaining({ id: "a" }), expect.objectContaining({ id: "b" })],
    });
    expect(bodies.slice(1)).toEqual([{ id: "s9" }, { id: "s3" }]);
  });

  it("reads what was replaced by request and place, and the failed requests", async () => {
    answer({ "/api/sessions/file": FILE });

    const draft = await prepareSessionFile({ kind: "shown" });

    expect(draft).toMatchObject({ name: "Checkout fails", requests: 2, failed: 1 });
    expect(draft.redactions).toEqual([
      { at: 1, endpoint: "auth.login", field: "variables.password" },
      { at: 2, endpoint: "orders", field: "url?api_key" },
    ]);
  });

  it("refuses an answer that is not a session file", async () => {
    answer({ "/api/sessions/file": { log: { entries: [] } } });

    await expect(prepareSessionFile({ kind: "shown" })).rejects.toThrow(
      "something other than a session file",
    );
  });

  it("names the file after its session", () => {
    expect(sessionFileName("Checkout fails!")).toBe("checkout-fails.courier-session.json");
    expect(sessionFileName("—")).toBe("session.courier-session.json");
    expect(sessionFileName("Checkout fails (opened from a file)")).toBe(
      "checkout-fails.courier-session.json",
    );
  });
});

describe("the session file dialog", () => {
  it("shows what was left out and the environment, and saves exactly the file shown", async () => {
    answer({ "/api/sessions/file": FILE });
    render(<SessionFileDialog />);

    await act(async () => shareSessionFile({ kind: "shown" }));
    const dialog = within(screen.getByRole("dialog"));
    const replaced = within(dialog.getByRole("list", { name: "Values replaced" }));

    expect(dialog.getByText("checkout-fails.courier-session.json")).toBeTruthy();
    expect(replaced.getByText("auth.login")).toBeTruthy();
    expect(replaced.getByText("url?api_key")).toBeTruthy();
    expect(dialog.getByText("sha256:0123456789abcdef")).toBeTruthy();

    fireEvent.click(dialog.getByRole("button", { name: "Download" }));

    expect(vi.mocked(downloadFile)).toHaveBeenCalledWith(
      JSON.stringify(FILE, null, 2),
      "checkout-fails.courier-session.json",
    );
    expect(useSessionFileDialog.getState().target).toBeNull();
  });

  it("says why Studio wrote no file, and offers nothing to download", async () => {
    answer({ "/api/sessions/file": new Error("Session not found") });
    render(<SessionFileDialog />);

    await act(async () => shareSessionFile({ kind: "saved", id: "gone" }));

    expect(screen.getByRole("alert").textContent).toContain("Session not found");
    expect(screen.getByRole("button", { name: "Download" })).toHaveProperty("disabled", true);
  });
});

describe("opening a session file", () => {
  it("keeps it in Studio and shows it with its environment, recording paused", async () => {
    answer({
      "/api/sessions/import": { id: "s2", name: LOADED.name },
      "/api/sessions/load": LOADED,
    });
    const file = new File([JSON.stringify(FILE)], "checkout.courier-session.json");

    const opened = await openSessionFile(file);

    expect(opened).toBe(true);
    expect(vi.mocked(post)).toHaveBeenCalledWith("/api/sessions/import", { file: FILE });
    expect(useStudioStore.getState()).toMatchObject({
      shownSession: { id: "s2", name: LOADED.name, environment: ENVIRONMENT },
      paused: true,
    });
    expect(useStudioStore.getState().requests.map((r) => r.id)).toEqual(["r1"]);
  });

  it("refuses a file that is not JSON before asking Studio, and tells Studio's reason for one it refuses", async () => {
    answer({ "/api/sessions/import": new Error("This is not a Courier session file") });

    const notJson = await openSessionFile(new File(["<html>"], "page.html"));
    const refused = await openSessionFile(new File(["{}"], "other.json"));

    expect([notJson, refused]).toEqual([false, false]);
    expect(vi.mocked(post)).toHaveBeenCalledTimes(1);
    expect(toast.error.mock.calls.map(([message]) => message)).toEqual([
      "page.html is not JSON, so it is not a session file",
      "Could not open other.json: This is not a Courier session file",
    ]);
    expect(useStudioStore.getState().shownSession).toBeNull();
  });

  it("opens a file dropped on the element, and says while one is over it", async () => {
    answer({ "/api/sessions/import": { id: "s2" }, "/api/sessions/load": LOADED });
    function Target(): React.ReactNode {
      const { over, handlers } = useSessionFileDrop();
      return (
        <div data-testid="target" {...handlers}>
          {over ? "over" : "idle"}
        </div>
      );
    }
    render(<Target />);
    const target = screen.getByTestId("target");
    const file = new File([JSON.stringify(FILE)], "checkout.courier-session.json");
    const dataTransfer = { types: ["Files"], files: [file] };

    fireEvent.dragEnter(target, { dataTransfer });
    expect(target.textContent).toBe("over");
    fireEvent.dragEnter(target, { dataTransfer: { types: ["text/plain"], files: [] } });
    await act(async () => {
      fireEvent.drop(target, { dataTransfer });
    });

    expect(target.textContent).toBe("idle");
    expect(useStudioStore.getState().shownSession?.id).toBe("s2");
  });
});

describe("a session opened from a file", () => {
  it("sets its environment beside this Studio's, line by line", async () => {
    const mine = { ...ENVIRONMENT, packages: { "@noverax/courier": "1.0.0" } };
    answer({ "/api/sessions/environment": mine });
    useStudioStore.setState({ shownSession: { id: "s2", name: "x", environment: ENVIRONMENT } });

    render(<OpenedSessionBanner />);
    await act(async () => {});

    expect(screen.getByText("2 differences from yours")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Environment" }));
    expect(screen.getByText("yours: 1.0.0")).toBeTruthy();
    expect(screen.getByText("yours: not a dependency")).toBeTruthy();
  });

  it("says when the environments agree, and shows nothing for a session saved here", async () => {
    answer({ "/api/sessions/environment": ENVIRONMENT });
    useStudioStore.setState({ shownSession: { id: "s2", name: "x", environment: ENVIRONMENT } });
    const { unmount } = render(<OpenedSessionBanner />);
    await act(async () => {});

    expect(screen.getByText("the same environment as yours")).toBeTruthy();
    unmount();
    useStudioStore.setState({ shownSession: { id: "s1", name: "saved here" } });
    render(<OpenedSessionBanner />);
    expect(screen.queryByRole("region", { name: "Opened from a session file" })).toBeNull();
  });

  it("names no host for a session a public demo recorded, and sets nothing beside it", async () => {
    const { node: _node, platform: _platform, ...fromDemo } = ENVIRONMENT;
    answer({ "/api/sessions/environment": ENVIRONMENT });
    useStudioStore.setState({ shownSession: { id: "s2", name: "x", environment: fromDemo } });

    render(<OpenedSessionBanner />);
    await act(async () => {});

    expect(screen.getByText("Studio 0.9.0")).toBeTruthy();
    expect(screen.getByText("the same environment as yours")).toBeTruthy();
    expect(environmentLines(fromDemo, ENVIRONMENT)[1]).toEqual({
      group: "Runtime",
      name: "Node.js",
      value: "not named",
    });
  });

  it("lists every line, and the other side's value only where it differs", () => {
    const lines = environmentLines(ENVIRONMENT, { ...ENVIRONMENT, definitions: {} });

    expect(environmentLines(ENVIRONMENT).every((line) => line.other === undefined)).toBe(true);
    expect(lines.filter((line) => line.other !== undefined)).toEqual([
      {
        group: "Definitions",
        name: "shop",
        value: "sha256:0123456789abcdef",
        other: "no such source",
      },
    ]);
  });
});

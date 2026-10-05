/**
 * @vitest-environment jsdom
 *
 * A request of the app whose bodies were too large for their events: the
 * inspector shows the part each event carried, says how large the whole
 * is and downloads it from the app; a snippet sends the whole from that
 * file; a replay sends the whole variables, never the part; a saved
 * session keeps each whole's size.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const socket = vi.hoisted(() => ({
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  connect: vi.fn(),
  timeout: vi.fn(),
}));
const asked = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/socket", () => ({ getSocket: () => socket }));
vi.mock("sonner", async (original) => ({ ...(await original<object>()), toast }));

import { requestView, responseView } from "@/features/requests/payload-view";
import { requestAsJson, requestSnippet } from "@/features/requests/request-snippets";
import { requestFromSaved, savedRequestOf } from "@/features/sessions/saved-request";
import { useStudioStore } from "@/store";
import { requestEntry } from "./request-entry-fixture";
import { openShell } from "./shell-harness";

const BIG = requestEntry({
  id: "big",
  group: "orders",
  method: "import",
  httpMethod: "POST",
  sessionId: "app",
  variables: { rows: [{ id: 1 }, "… 9,999 more items"] },
  variablesCutFrom: 412_000,
  data: [{ id: 1 }, "… 45,999 more items"],
  dataCutFrom: 3_821_455,
});

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

const saved: string[] = [];

beforeEach(() => {
  saved.length = 0;
  socket.emit.mockClear();
  asked.mockReset();
  socket.timeout.mockReturnValue({ emit: asked });
  URL.createObjectURL = vi.fn(() => "blob:body");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push(this.download);
  });
  useStudioStore.setState({
    connected: true,
    connectionStatus: "connected",
    requests: [BIG],
    heldRequests: [],
    paused: false,
    shownSession: null,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the views of a request whose bodies were too large for their events", () => {
  it("say how large each whole is, and show a text answer as text", () => {
    expect(responseView(BIG)).toMatchObject({ cutFrom: 3_821_455 });
    expect(requestView(BIG)).toMatchObject({ cutFrom: 412_000 });
    expect(responseView(requestEntry({ data: "<html>" }))).toMatchObject({ text: "<html>" });
  });

  it("write snippets that send the whole variables from the file they download as", () => {
    const file = "api.orders.import-request.json";

    expect(requestSnippet(BIG, "shell").code).toContain(`--data-binary '@${file}'`);
    expect(requestSnippet(BIG, "browser").code).toMatch(
      new RegExp(
        `^// wholeBody: .*${file.replaceAll(".", "\\.")}\\n[^]*JSON\\.stringify\\(wholeBody\\)`,
      ),
    );
    expect(requestSnippet(BIG, "courier").code).toContain("await caller.orders.import(wholeBody);");
    expect(requestSnippet(BIG, "shell").code).not.toContain("more items");
  });

  it("export and save the size of each whole", () => {
    expect(JSON.parse(requestAsJson(BIG))).toMatchObject({
      variablesCutFrom: 412_000,
      responseCutFrom: 3_821_455,
    });
    expect(requestFromSaved(savedRequestOf(BIG))).toMatchObject({
      variablesCutFrom: 412_000,
      dataCutFrom: 3_821_455,
    });
  });
});

describe("the inspector of such a request", () => {
  const inspector = () => within(screen.getByRole("complementary", { name: "Request inspector" }));

  it("downloads the whole answer from the app that made the request", async () => {
    await openShell("/timeline?req=big&tab=response");
    expect(inspector().getByText(/The whole body is 3\.6 MB/)).toBeTruthy();

    await settle(() =>
      fireEvent.click(inspector().getByRole("button", { name: "Download whole" })),
    );
    const [event, payload, answer] = asked.mock.calls[0] ?? [];
    await settle(() => answer?.(null, { ok: true, data: "[1]" }));

    expect([event, payload]).toEqual([
      "request:body",
      { sessionId: "app", requestId: "big", part: "response" },
    ]);
    expect(saved).toEqual(["api.orders.import-response.json"]);
  });

  it("replays with the whole variables, which it asks the app for first", async () => {
    await openShell("/timeline?req=big");

    await settle(() => fireEvent.click(inspector().getByTitle("Replay request")));
    expect(socket.emit).not.toHaveBeenCalledWith("playground:exec", expect.anything());
    const [, payload, answer] = asked.mock.calls[0] ?? [];
    await settle(() => answer?.(null, { ok: true, data: '{"rows":[{"id":1},{"id":2}]}' }));

    expect(payload).toEqual({ sessionId: "app", requestId: "big", part: "request" });
    expect(socket.emit).toHaveBeenCalledWith(
      "playground:exec",
      expect.objectContaining({ variables: { rows: [{ id: 1 }, { id: 2 }] } }),
    );
  });

  it("does not replay a part for the whole the app no longer keeps", async () => {
    await openShell("/timeline?req=big");

    await settle(() => fireEvent.click(inspector().getByTitle("Replay request")));
    const [, , answer] = asked.mock.calls[0] ?? [];
    await settle(() => answer?.(null, { ok: false, error: "The app no longer keeps it." }));

    expect(socket.emit).not.toHaveBeenCalledWith("playground:exec", expect.anything());
    expect(toast.error).toHaveBeenCalledWith("Could not replay api.orders.import", {
      description: "The app no longer keeps it.",
    });
  });
});

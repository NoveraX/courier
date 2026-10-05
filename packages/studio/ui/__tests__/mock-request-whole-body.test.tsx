/**
 * @vitest-environment jsdom
 *
 * A body too large for a request's event: the sheet shows the part the
 * event carried, says how large the whole is, and downloads the whole from
 * the mock; a cURL for such a request sends the body from that file.
 */
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const command = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", async (original) => ({ ...(await original<object>()), toast }));

vi.mock("@/socket", () => ({
  getSocket: () => ({
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    timeout: () => ({ emit: command }),
  }),
}));

import { mockRequestView } from "@/features/mocks/mock-request-view";
import { useStudioStore } from "@/store";
import { useMockStore } from "@/store/mock-slice";
import { mockLog, mockServer } from "./mock-server-fixture";
import { openShell } from "./shell-harness";

const PART = [{ id: 1 }, { id: 2 }, "… 45,998 more items"];
const LIST = mockLog({
  id: "big",
  path: "/api/orders",
  group: "orders",
  endpoint: "list",
  data: PART,
  dataCutFrom: 3_821_455,
});
const CREATE = mockLog({
  id: "upload",
  httpMethod: "post",
  path: "/api/orders",
  group: "orders",
  endpoint: "create",
  variables: { note: "nnnn… 39,970 more characters" },
  variablesCutFrom: 40_012,
});

async function settle(interaction: () => void): Promise<void> {
  await act(async () => {
    interaction();
  });
}

const saved: Array<{ name: string; blob: Blob }> = [];

beforeEach(() => {
  saved.length = 0;
  let last: Blob | undefined;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    last = blob;
    return "blob:body";
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (last) saved.push({ name: this.download, blob: last });
  });
  useStudioStore.setState({ connected: true, connectionStatus: "connected", requests: [] });
  useMockStore.setState({
    servers: { "api-mock": mockServer() },
    activeServerId: "api-mock",
    logs: [LIST, CREATE],
    logsPaused: false,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("a request's view, with a body too large for its event", () => {
  it("says how large each whole body is", () => {
    expect(mockRequestView(LIST, "").response).toMatchObject({ value: PART, cutFrom: 3_821_455 });
    expect(mockRequestView(CREATE, "").request).toMatchObject({ cutFrom: 40_012 });
  });

  it("gives a cURL that sends the request's whole body from the file it downloads as", () => {
    const view = mockRequestView(CREATE, "http://localhost:7011");

    expect(view.bodyFile).toBe("orders.create-request.json");
    expect(view.curl).toContain("--data-binary '@orders.create-request.json'");
    expect(view.curl).not.toContain("more characters");
  });
});

describe("the sheet of a request with a body too large for its event", () => {
  async function openSheet(path: string) {
    await openShell(path);
    return within(screen.getByRole("complementary", { name: "Mock request" }));
  }

  it("says how large the whole is, and downloads it from the mock", async () => {
    const sheet = await openSheet("/mocks/logs?mreq=big");
    expect(sheet.getByText(/The whole body is 3\.6 MB/)).toBeTruthy();

    await settle(() => fireEvent.click(sheet.getByRole("button", { name: "Download whole" })));
    const [event, payload, answer] = command.mock.calls[0] ?? [];
    await settle(() => answer?.(null, { ok: true, data: '[{"id":1}]' }));

    expect([event, payload]).toEqual([
      "mock:body",
      { serverId: "api-mock", requestId: "big", part: "response" },
    ]);
    expect(saved.map(({ name }) => name)).toEqual(["orders.list-response.json"]);
    expect(await saved[0]?.blob.text()).toBe('[{"id":1}]');
  });

  it("says so when the mock no longer keeps the whole body", async () => {
    const sheet = await openSheet("/mocks/logs?mreq=big");

    await settle(() => fireEvent.click(sheet.getByRole("button", { name: "Download whole" })));
    const [, , answer] = command.mock.calls[0] ?? [];
    await settle(() => answer?.(null, { ok: false, error: "The mock no longer keeps it." }));

    expect(toast.error).toHaveBeenCalledWith("Could not download the whole response body", {
      description: "The mock no longer keeps it.",
    });
    expect(saved).toEqual([]);
  });

  it("names the file a cURL sends the request's body from, and downloads it", async () => {
    const sheet = await openSheet("/mocks/logs?mreq=upload");
    await settle(() => fireEvent.click(sheet.getByRole("tab", { name: /^cURL/ })));

    expect(sheet.getByText(/too large to write out/)).toBeTruthy();
    await settle(() => fireEvent.click(sheet.getByRole("button", { name: "Download whole" })));

    expect(command.mock.calls[0]?.[1]).toMatchObject({ requestId: "upload", part: "request" });
  });
});

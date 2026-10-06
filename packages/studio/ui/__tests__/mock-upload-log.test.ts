/**
 * A slow upload to a mock is in its log as it arrives: the mock's reports
 * make the request's row and say how much has come — its code `↑42%`, its
 * sheet "Uploading" — and the request's start fills the same row in, in
 * its place and at its time, its body then whole.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { logCode } from "@/features/mocks/logs-view";
import { mockRequestCells } from "@/features/mocks/mock-request-cells";
import { mockRequestView } from "@/features/mocks/mock-request-view";
import { handleMockEvent } from "@/store/handle-mock-events";
import { useMockStore } from "@/store/mock-slice";

const ARRIVAL = {
  serverId: "files",
  requestId: "req_up",
  httpMethod: "POST",
  path: "/files",
  group: "files",
  endpoint: "create",
  source: "override",
};

function report(received: number, timestamp: number): void {
  handleMockEvent({
    type: "mock:request:upload",
    ...ARRIVAL,
    received,
    total: 8_388_608,
    timestamp,
  });
}

beforeEach(() => {
  useMockStore.setState({ logs: [], logsPaused: false });
});

describe("a slow upload in a mock's log", () => {
  it("has its row as soon as the mock reports it, saying how much has arrived", () => {
    report(2_097_152, 100);

    const [log] = useMockStore.getState().logs;
    expect(log).toMatchObject({
      id: "req_up",
      path: "/files",
      source: "override",
      timestamp: 100,
      upload: { received: 2_097_152, total: 8_388_608, arriving: true },
    });
    expect(log && logCode(log)).toBe("↑25%");
  });

  it("moves its row on with each report, keeping one row", () => {
    report(2_097_152, 100);
    report(6_291_456, 350);

    const logs = useMockStore.getState().logs;
    expect(logs).toHaveLength(1);
    expect(logs[0] && logCode(logs[0])).toBe("↑75%");
    expect(logs[0]?.timestamp).toBe(100);
  });

  it("is filled in by its start, in its place and time, its body whole", () => {
    report(2_097_152, 100);
    handleMockEvent({
      type: "mock:request:start",
      ...ARRIVAL,
      variables: { file: {} },
      timestamp: 900,
    });

    const logs = useMockStore.getState().logs;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      timestamp: 100,
      variables: { file: {} },
      upload: { received: 8_388_608, total: 8_388_608, arriving: false },
    });
    expect(logs[0] && logCode(logs[0])).toBe("···");
  });

  it("is said in its sheet and figures while it arrives", () => {
    report(2_097_152, 100);
    const log = useMockStore.getState().logs[0];
    if (!log) throw new Error("no row");

    const view = mockRequestView(log, "http://localhost:7001");
    const [status] = mockRequestCells(log, 200, 500);

    expect(view.request).toMatchObject({ empty: { title: "Uploading" } });
    expect(view.request.empty?.detail).toMatch(/^2\.0 MB of 8\.0 MB has arrived/);
    expect(view.response).toMatchObject({ empty: { title: "Waiting for the upload" } });
    expect(status).toMatchObject({ value: "Uploading 25%", sub: "2.0 MB arrived" });
  });

  it("is a row for a request cut off as it arrived, its code RST", () => {
    report(2_097_152, 100);
    handleMockEvent({ type: "mock:request:start", ...ARRIVAL, timestamp: 400 });
    handleMockEvent({
      type: "mock:request:error",
      serverId: "files",
      requestId: "req_up",
      status: 502,
      message: "Upload Interrupted (simulated)",
      duration: 400,
    });

    const [log] = useMockStore.getState().logs;
    expect(log && logCode(log)).toBe("RST");
  });
});

/**
 * A request a mock answered, as its sheet shows it: the status and reason,
 * how long it took, what answered it, and when; the answer and what was
 * sent; each side's headers; and a cURL to send it again with credentials
 * left out.
 */
import { describe, expect, it } from "vitest";

import { mockRequestCells } from "@/features/mocks/mock-request-cells";
import { mockRequestView } from "@/features/mocks/mock-request-view";
import { mockLog } from "./mock-server-fixture";

describe("a mock request's figures", () => {
  it("give its status and reason, its time against the slow threshold, what answered it and when", () => {
    const log = mockLog({ status: 409, source: "scenario", duration: 750, timestamp: 1_000 });

    const cells = mockRequestCells(log, 61_000, 500);

    expect(cells.map((c) => [c.label, c.value, c.sub ?? ""])).toEqual([
      ["Status", "409", "Conflict"],
      ["Duration", "750ms", ""],
      ["Answered by", "scenario", ""],
      ["Time", expect.any(String), "1 minute ago"],
    ]);
    expect(cells[1]?.tone).toBe("warn");
  });

  it("say a request still waiting is in flight", () => {
    const [status] = mockRequestCells(mockLog({ status: undefined }), 0, 500);

    expect(status).toMatchObject({ value: "In flight", tone: "muted" });
  });
});

describe("a mock request's sheet", () => {
  it("shows the answer, what was sent and both sides' headers", () => {
    const log = mockLog({
      data: [{ id: 1 }],
      variables: { limit: 10 },
      requestHeaders: { accept: "application/json" },
      responseHeaders: { "content-type": "application/json", "x-total": "1" },
    });

    const view = mockRequestView(log, "http://localhost:7001");

    expect(view.tabs.map((t) => [t.key, t.label, t.count])).toEqual([
      ["response", "Response", undefined],
      ["request", "Request", undefined],
      ["headers", "Headers", 3],
      ["snippets", "cURL", undefined],
    ]);
    expect(view.response.value).toEqual([{ id: 1 }]);
    expect(view.request.value).toEqual({ limit: 10 });
    expect(view.headers.map((g) => g.rows.length)).toEqual([2, 1]);
  });

  it("says why there is no answer, and no variables", () => {
    const view = mockRequestView(
      mockLog({
        data: undefined,
        variables: {},
        status: 502,
        error: "Connection Reset (simulated)",
      }),
      "",
    );

    expect(view.response.empty).toEqual({
      title: "No body",
      detail: "Connection Reset (simulated)",
    });
    expect(view.request.empty?.title).toBe("No variables");
  });

  it("sends it to the mock again as cURL, credentials and transport headers left out", () => {
    const view = mockRequestView(
      mockLog({
        httpMethod: "post",
        path: "/api/users",
        variables: { name: "Ada" },
        requestHeaders: { host: "localhost:7001", authorization: "Bearer secret", "x-trace": "t1" },
      }),
      "http://localhost:7001",
    );

    expect(view.curl).toContain("-X POST");
    expect(view.curl).toContain("'http://localhost:7001/api/users'");
    expect(view.curl).toContain("authorization: <redacted>");
    expect(view.curl).toContain("x-trace: t1");
    expect(view.curl).not.toContain("secret");
    expect(view.curl).not.toContain("-H 'host:");
    expect(view.curl).toContain(`-d '{"name":"Ada"}'`);
    expect(view.redacted).toBe(true);
  });

  it("sends a read and a DELETE again with their variables in the query string the path keeps", () => {
    for (const httpMethod of ["get", "delete"]) {
      const view = mockRequestView(
        mockLog({ httpMethod, path: "/api/users?page=2", variables: { page: 2 } }),
        "http://localhost:7001",
      );

      expect(view.curl).toContain("'http://localhost:7001/api/users?page=2'");
      expect(view.curl).not.toContain("-d ");
    }
  });
});

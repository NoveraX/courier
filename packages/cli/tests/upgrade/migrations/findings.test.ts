import { describe, expect, it } from "vitest";

import { CALL_ERROR_FINDINGS } from "../../../src/upgrade/migrations/call-error-findings";
import { CANCEL_PREVIOUS_LIST } from "../../../src/upgrade/migrations/cancel-previous-list";
import { REALTIME_FINDINGS } from "../../../src/upgrade/migrations/realtime-findings";
import { migrateWith } from "./migrate-with";

describe("what the migrations find and leave to the person", () => {
  it("finds 0.4's call errors, each with what to write instead", () => {
    const { text, findings } = migrateWith(
      CALL_ERROR_FINDINGS,
      `import { HTTPError } from "@noverax/courier";
if (error.data.code === "TIMEOUT") {}
if (error.status === 499) {}
if (error.data.code === "ECONNREFUSED") {}
throw new HTTPError({ status: 0, data: {} });
if (error instanceof DOMException && error.name === "AbortError") {}
const options = { onError: (error: HTTPError) => log(error) };
`,
    );

    expect(text).not.toContain("isTimeoutError");
    expect(findings.map((finding) => [finding.line, finding.instead[0]])).toEqual([
      [2, "isTimeoutError(error)"],
      [3, 'isAbortError(error) && error.code === "SUPERSEDED"'],
      [4, 'error.systemCode === "ECONNREFUSED"'],
      [5, "new NetworkError({ cause })"],
      [6, "isAbortError(error)"],
      [7, "onError: (error: RequestFailure) => log(error)"],
    ]);
  });

  it("finds 0.4's registry calls, the client's options the server names now, and a host entry that never matched", () => {
    const { findings } = migrateWith(
      REALTIME_FINDINGS,
      `handler.connections.disconnect(id, 4003, "Banned");
handler.connections.disconnectByMeta((meta) => meta.userId === id, 4003);
connections.getByMeta(isAdmin);
sse.sseConnections.disconnect(id, "bye");
sseConnections.broadcastToMeta((meta) => meta.room === room, event);
createCaller(api, { ws: { heartbeat: 30_000 } });
createHandler({ allowedHosts: ["https://example.com", "api.example.com"] });
handler.connections.disconnect(id);
`,
    );

    expect(findings.map((finding) => [finding.line, finding.instead[0]])).toEqual([
      [1, 'await handler.connections.disconnect(id, { code: 4003, reason: "Banned" })'],
      [
        2,
        "await handler.connections.disconnect({ meta: { /* the fields to match */ } }, { code: 4003 })",
      ],
      [3, "connections.list({ meta: { /* the fields to match */ } })"],
      [4, "await sse.sseConnections.disconnect(id)"],
      [5, "sseConnections.broadcastToMeta({ /* the fields to match */ }, event)"],
      [6, "createWSHandler({ heartbeatIntervalMs, heartbeatTimeoutMs, maxMessageSize })"],
      [7, 'allowedHosts: ["example.com"]'],
    ]);
  });

  it("finds cancelPrevious given as a list, and leaves the flag", () => {
    const { findings } = migrateWith(
      CANCEL_PREVIOUS_LIST,
      'defineApi({ cancelPrevious: ["users.search"] });\ncreateCaller(api, { cancelPrevious: true });\n',
    );

    expect(findings.map((finding) => finding.line)).toEqual([1]);
  });

  it("finds 0.4's call errors where the code takes HTTPError from one of the core's entries", () => {
    const { findings } = migrateWith(
      CALL_ERROR_FINDINGS,
      `import { HTTPError } from "@noverax/courier/server";
throw new HTTPError({ status: 0, data: {} });
`,
    );

    expect(findings.map((finding) => finding.line)).toEqual([2]);
  });
});

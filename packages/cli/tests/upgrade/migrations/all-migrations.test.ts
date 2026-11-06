import { describe, expect, it } from "vitest";

import { migrateCode } from "../../../src/upgrade/codemod/run-migrations";
import { RELEASES } from "../../../src/upgrade/releases";

const ALL = RELEASES.flatMap((release) => release.migrations);

/* Code written for 0.3 and 0.4 that every migration of 0.4.0 and 0.5.0 has something to do with. */
const OLD = `import { loadCourierConfig } from "@noverax/courier-studio-core/config";
import { AuthError, createWSHandler, isHTTPError, sendAuthRequired, TimeoutError } from "@noverax/courier";
import { retryMiddleware } from "@noverax/courier/middleware";
import type { SSESubscription } from "@noverax/courier/realtime";

const handler = createWSHandler({});
const retry = retryMiddleware({ retryOn: [0, 503] });
let stream: SSESubscription;

export async function revoke(id: string, error: unknown) {
  sendAuthRequired(handler.connections, id, 10_000);
  if (isHTTPError(error) && error.status === 0) throw new TimeoutError();
  if (error instanceof AuthError) await loadCourierConfig();
  handler.connections.disconnect(id, 4003, "Banned");
}
`;

/* Code written for 0.4 whose endpoints' kinds and variables' code 0.5.0 changed. */
const OLD_KINDS = `import { isConfigurationError } from "@noverax/courier";
import { courier, defineGroup } from "@noverax/courier/define";
import type { HttpProbe } from "@noverax/courier/define";

const { endpoint } = courier();
const byId: HttpProbe<{ id: string }> = (http, vars) => http.get(":id", vars);

export const users = defineGroup({
  prefix: "users",
  endpoints: {
    get: endpoint.variables<{ id: string }>().via(byId).response<User>(),
    report: endpoint.variables<{ year: number }>().via((http, { year }) => http.get(http.path\`reports/\${year}\`)).reads(),
    export: endpoint.via((http) => http.get("export")).retry({ retryOn: [0] }),
    search: endpoint.via((http, v) => (v.long ? http.post("search", v) : http.get("search", v))),
  },
});

export function refused(error: unknown) {
  return isConfigurationError(error) && error.code === "PROXY_VARIABLE_NOT_SERIALIZABLE";
}
`;

describe("every migration together", () => {
  it("carries code written for 0.3 and 0.4 over, and changes nothing the second time", () => {
    const once = migrateCode(
      { files: [{ path: "src/a.ts", text: OLD }], unread: [], stopped: false },
      ALL,
    );
    const after = once.edits[0]?.after ?? "";
    const twice = migrateCode(
      { files: [{ path: "src/a.ts", text: after }], unread: [], stopped: false },
      ALL,
    );

    expect(after).toContain('import { loadCourierConfig } from "@noverax/courier-build/config";');
    expect(after).toContain('from "@noverax/courier/realtime"');
    expect(after).toContain("await handler.connections.requireAuth(id, { timeoutMs: 10_000 });");
    expect(after).toContain('retryOn: ["network", "timeout", 503]');
    expect(after).toContain(
      "if (isNetworkError(error) || isTimeoutError(error)) throw new RealtimeTimeoutError();",
    );
    expect(after).toContain("let stream: Subscription;");
    expect(once.manual.map((step) => step.what)).toEqual([
      expect.stringMatching(/^line \d+: disconnect\(\) takes its code and reason as options/),
    ]);
    expect(twice.edits).toEqual([]);
    expect(twice.manual).toEqual(once.manual);
  });

  it("carries 0.4's endpoints and variables' code over, finds the kinds left to the person, and changes nothing the second time", () => {
    const run = (text: string) =>
      migrateCode({ files: [{ path: "src/api.ts", text }], unread: [], stopped: false }, ALL);
    const once = run(OLD_KINDS);
    const after = once.edits[0]?.after ?? "";
    const twice = run(after);

    expect(after).toContain(
      `report: endpoint.variables<{ year: number }>().via((http, { year }) => http.get(http.path\`reports/\${year}\`)),`,
    );
    expect(after).toContain('.retry({ retryOn: ["network", "timeout"] })');
    expect(after).toContain('http.get("search", v))).writes(),');
    expect(after).toContain('error.code === "VARIABLE_NOT_ENCODABLE"');
    const reads = (line: number) =>
      expect.stringMatching(
        new RegExp(`^line ${line}: its closure calls a reading verb, so the endpoint reads,`),
      );
    const typed = expect.stringMatching(/^line 6: HttpProbe<Variables> no longer says which verb/);
    expect(once.manual.map((step) => step.what)).toEqual([reads(13), typed]);
    expect(twice.edits).toEqual([]);
    /* The second time, the read whose .reads() went names no kind, as 0.4's code without one does. */
    expect(twice.manual.map((step) => step.what)).toEqual([reads(12), reads(13), typed]);
  });
});

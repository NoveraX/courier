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
});

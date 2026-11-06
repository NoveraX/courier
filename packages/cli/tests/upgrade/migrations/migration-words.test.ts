import { describe, expect, it } from "vitest";

import { parseSource } from "../../../src/source/parse-source";
import { programOf } from "../../../src/upgrade/codemod/ast";
import { mentions } from "../../../src/upgrade/codemod/mentions";
import { RELEASES } from "../../../src/upgrade/releases";

const MIGRATIONS = RELEASES.flatMap((release) => release.migrations);

/* Code each migration of 0.4.0 and 0.5.0 has something to do with, and code beside it that it has nothing to do with. */
const CODE = [
  `import { loadCourierConfig } from "@noverax/courier-studio-core/config";
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
}`,
  `import { endpoint, isHTTPError } from "@noverax/courier";
export const orders = endpoint.get("orders").variables<{ id: string }>();
if (isHTTPError(error) && error.status === 404) {}`,
  `import { HTTPError } from "@noverax/courier";
if (error.data.code === "TIMEOUT") {}
if (error.status === 499) {}
if (error.data.code === "ECONNREFUSED") {}
throw new HTTPError({ status: 0, data: {} });
if (error instanceof DOMException && error.name === "AbortError") {}
const options = { onError: (error: HTTPError) => log(error) };`,
  `handler.connections.disconnectByMeta((meta) => meta.userId === id, 4003);
connections.getByMeta(isAdmin);
sse.sseConnections.disconnect(id, "bye");
sseConnections.disconnectAll("bye");
sseConnections.broadcastToMeta((meta) => meta.room === room, event);
createCaller(api, { ws: { heartbeat: 30_000, maxMessageSize: 1024 } });
createHandler({ allowedHosts: ["https://example.com"] });
class Bus implements PubSubAdapter {}`,
  `createClient({ cancelPrevious: ["search"] });
api.with({ cancelPrevious: true });`,
  `import { retryMiddleware } from "@noverax/courier/middleware";
retryMiddleware({ retryOn: [0, 0, 503] });
api.retry({ retryOn: (error) => error.status === 0 });`,
  `const config = require("@noverax/courier-studio-core/config");
export { findMocksFile } from "@noverax/courier-studio-core/config";
const later = import("@noverax/courier-studio-core/config");`,
  `import { TimeoutError as Late, isRealtimeError, fromErrorCode } from "@noverax/courier";
export { RateLimitError, ForbiddenError } from "@noverax/courier";
import { TimeoutError } from "@noverax/courier/realtime";`,
  `import { sendAuthRequired } from "@noverax/courier";
const asked = sendAuthRequired(registry, id);`,
  `import { courier } from "@noverax/courier/define";
import type { HttpProbe } from "@noverax/courier/define";
const { endpoint } = courier();
const byId: HttpProbe<{ id: string }> = (http, vars) => http.get(":id", vars);
export const report = endpoint.via((http) => http.get("reports")).reads();
export const read = endpoint.via((http) => http.get("a"));`,
  `if (error.code === "PROXY_VARIABLE_NOT_SERIALIZABLE") {}
const messages = { PROXY_VARIABLE_NOT_SERIALIZABLE: "That cannot be sent" };`,
  `import { defineConfig } from "@noverax/courier/config";
export default defineConfig({
  imports: { pets: { importType: "url", from: "https://ana:pw@specs.example/pets.json", pinHash: "abc" } },
});`,
];

/* Each piece of code, and each with one of its lines left out: what a migration finds in one, it finds where its words are. */
const VARIANTS = CODE.flatMap((text) => {
  const lines = text.split("\n");
  return [text, ...lines.map((_, at) => lines.filter((__, other) => other !== at).join("\n"))];
});

function done(text: string) {
  const parsed = parseSource("file.ts", text);
  if (parsed.problem !== null) return undefined;
  const program = programOf(parsed.program);
  return MIGRATIONS.map((migration) => {
    const { edits, findings } = migration.migrate({ path: "file.ts", text, program });
    return { migration, acts: edits.length > 0 || findings.length > 0 };
  });
}

describe("the words a migration looks for", () => {
  it("are written wherever the migration has something to do", () => {
    const acted = new Set<string>();
    for (const text of VARIANTS)
      for (const { migration, acts } of done(text) ?? []) {
        if (!acts) continue;
        acted.add(migration.id);
        expect(mentions(text, migration.mentions), `${migration.id} in:\n${text}`).toBe(true);
      }

    expect([...acted].sort()).toEqual(MIGRATIONS.map((migration) => migration.id).sort());
  });
});

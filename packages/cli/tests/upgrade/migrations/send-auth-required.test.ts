import { describe, expect, it } from "vitest";

import { SEND_AUTH_REQUIRED } from "../../../src/upgrade/migrations/send-auth-required";
import { migrateWith } from "./migrate-with";

describe("0.5.0: sendAuthRequired()", () => {
  it("asks with requireAuth() in an async function, its deadline as an option, and drops the import once unused", () => {
    const { text, findings } = migrateWith(
      SEND_AUTH_REQUIRED,
      `import { createWSHandler, sendAuthRequired } from "@noverax/courier";
const handler = createWSHandler({});
async function revoke(id: string) {
  sendAuthRequired(handler.connections, id, 10_000);
  sendAuthRequired(handler.connections, id);
}
`,
    );

    expect(text).toBe(`import { createWSHandler } from "@noverax/courier";
const handler = createWSHandler({});
async function revoke(id: string) {
  await handler.connections.requireAuth(id, { timeoutMs: 10_000 });
  await handler.connections.requireAuth(id);
}
`);
    expect(findings).toEqual([]);
  });

  it("leaves a call outside an async function, or one whose value is used, with what to write", () => {
    const { text, findings } = migrateWith(
      SEND_AUTH_REQUIRED,
      `import { sendAuthRequired } from "@noverax/courier";
function revoke(registry: R, id: string) {
  sendAuthRequired(registry, id, 5000);
}
const cancel = async () => sendAuthRequired(getRegistry(), "a");
`,
    );

    expect(text).toContain('import { sendAuthRequired } from "@noverax/courier";');
    expect(findings).toEqual([
      expect.objectContaining({
        line: 3,
        instead: ["await registry.requireAuth(id, { timeoutMs: 5000 })"],
      }),
      expect.objectContaining({ line: 5, instead: ['await getRegistry().requireAuth("a")'] }),
    ]);
  });

  it("changes nothing where the name is the file's own", () => {
    const own =
      "function sendAuthRequired(a: unknown, b: string) {}\nsendAuthRequired(registry, id);\n";

    expect(migrateWith(SEND_AUTH_REQUIRED, own)).toEqual({ text: own, findings: [], packages: [] });
  });
});

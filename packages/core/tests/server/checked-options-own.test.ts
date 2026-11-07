/**
 * Options are data, which a server reads as they are: their own properties
 * alone. What a prototype answers for one they do not have — a prototype
 * of the user's, or `Object.prototype` that code elsewhere in the process
 * changed — is no option of theirs, before the check or after it; and
 * what it holds of the options it checked it reads the same way, its own
 * fields alone.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCaller as createPageCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { withIncomingRequest } from "../../src/node-request-context";
import { createCaller } from "../../src/server/create-caller";
import type { IncomingRequest } from "../../src/session/incoming-request";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

const { endpoint } = courier();
let upstream: Upstream;

beforeAll(async () => {
  upstream = await startUpstream((_req, res) => sendJson(res, 200, { ok: true }));
});

afterAll(async () => {
  await upstream.close();
});

/* An API that keeps a session, naming no header list, its options frozen by their user over
   `prototype` — the session frozen to its depths, as a server takes it there. */
function frozenOver(prototype: object) {
  const api = defineApi({
    name: "accounts",
    baseURL: upstream.url,
    session: Object.freeze({ cookies: Object.freeze(["sid"]) }),
    endpoints: { me: endpoint.get("me") },
  });
  Object.assign(api, {
    options: Object.freeze(Object.assign(Object.create(prototype), api.options)),
  });
  return api;
}

/* What the API was sent of the browser's cookie by a call that names the request it serves, the
   request carrying a cookie of the browser's and none of the session's. */
async function cookieSent(api: ReturnType<typeof frozenOver>): Promise<string | undefined> {
  upstream.seen.length = 0;
  const req = new Request("https://app.example.com/account", {
    headers: { cookie: "other=made-up-other" },
  });
  await createPageCaller(api, { context: { req } }).me();
  return upstream.seen[0]?.headers.cookie;
}

/* `Object.prototype` given `key` for as long as `run` takes, as code elsewhere in a process might. */
async function onObjectPrototype(key: string, value: unknown, run: () => Promise<void> | void) {
  Object.defineProperty(Object.prototype, key, { configurable: true, writable: true, value });
  try {
    await run();
  } finally {
    Reflect.deleteProperty(Object.prototype, key);
  }
}

describe("a server", () => {
  it("takes no header list a prototype of the user's is given after the check", async () => {
    const prototype: Record<string, unknown> = {};
    const api = frozenOver(prototype);
    createCaller(api);
    prototype.allowedHeaders = ["cookie"];

    expect(await cookieSent(api)).toBeUndefined();
  });

  it("takes no header list Object.prototype is given, before the check or after it", async () => {
    const before = frozenOver(Object.prototype);
    await onObjectPrototype("allowedHeaders", ["cookie"], async () => {
      createCaller(before);
      expect(await cookieSent(before)).toBeUndefined();
    });
    const after = frozenOver(Object.prototype);
    createCaller(after);
    await onObjectPrototype("allowedHeaders", ["cookie"], async () => {
      expect(await cookieSent(after)).toBeUndefined();
    });
  });

  it("holds a session Object.prototype answers nothing for: one over plain HTTP is refused", async () => {
    await onObjectPrototype("allowHttp", true, () => {
      const api = defineApi({
        name: "accounts",
        baseURL: "http://api.example.com",
        session: { cookies: ["sid"] },
        endpoints: { me: endpoint.get("me") },
      });

      expect(() => createCaller(api)).toThrow(
        expect.objectContaining({ code: "SESSION_INSECURE_TRANSPORT" }),
      );
    });
  });

  it("reads how an endpoint takes the session of its own options: Object.prototype leaves no write unguarded", async () => {
    const api = defineApi({
      name: "accounts",
      baseURL: upstream.url,
      session: { cookies: ["sid"] },
      endpoints: { rename: endpoint.post("me/name") },
    });
    const caller = createCaller(api);
    const fromElsewhere: IncomingRequest = {
      key: {},
      method: "POST",
      origin: "https://app.example.com",
      headers: new Headers({
        cookie: "sid=made-up-session",
        "sec-fetch-site": "cross-site",
        origin: "https://evil.example",
      }),
    };
    upstream.seen.length = 0;

    await onObjectPrototype("session", "unguarded", async () => {
      await expect(withIncomingRequest(fromElsewhere, () => caller.rename())).rejects.toMatchObject(
        { status: 403 },
      );
    });
    expect(upstream.seen).toEqual([]);
  });
});

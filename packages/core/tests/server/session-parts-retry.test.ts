/**
 * What the server's session loads with the first call that needs it — the
 * reading of a request, the relay of the cookies an answer sets — is asked
 * for again by the next call when the load failed, rather than failing
 * every call of the process with the same rejection.
 */
import { describe, expect, it, vi } from "vitest";

import { SERVER_SESSION } from "../../src/server/session/session-capability";
import { sessionTargetOf } from "../../src/session/session-target";

const loads = { session: 0, relay: 0 };
vi.mock("../../src/server/session/server-session", async (importOriginal) => {
  loads.session += 1;
  if (loads.session === 1) throw new Error("the reading of a request did not load");
  return importOriginal();
});
vi.mock("../../src/server/session/relay", async (importOriginal) => {
  loads.relay += 1;
  if (loads.relay === 1) throw new Error("the relay of cookies did not load");
  return importOriginal();
});

const options = { baseURL: "https://api.example.com", session: { cookies: ["sid"] } };
const target = sessionTargetOf({
  dataSource: { options },
  options,
  kind: "query",
  httpMethod: "GET",
  name: "accounts.me",
});
const context = {
  req: new Request("https://app.example.com/", { headers: { cookie: "sid=made-up-session" } }),
};

describe("the server's session, where a part of it failed to load once", () => {
  it("loads the reading of a request again for the next call, which carries the session", async () => {
    await expect(SERVER_SESSION.contextSession(context, target)).rejects.toThrow();
    const session = await SERVER_SESSION.contextSession(context, target);

    expect(session?.carries).toBe(true);
    expect(loads.session).toBe(2);
  });

  it("loads the relay of an answer's cookies again for the next call", async () => {
    const session = await SERVER_SESSION.contextSession(context, target);
    if (session === undefined) throw new Error("the context names a request");
    const answer = new Headers({ "set-cookie": "sid=made-up-renewed; Path=/" });

    await expect(SERVER_SESSION.relayCookies(answer, session, true)).rejects.toThrow();
    await expect(SERVER_SESSION.relayCookies(answer, session, true)).resolves.toBeInstanceOf(Array);
    expect(loads.relay).toBe(2);
  });
});

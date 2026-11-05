/**
 * On a server, `getToken` and `refreshToken` read the user of the request
 * being served, and every user's calls go through the API's one
 * `authMiddleware`. A refresh is shared by the calls refused with the token
 * it renews and by no other: each user's call is sent again with that
 * user's token, whether another user's refresh is still running or over.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { authMiddleware } from "../../src/middleware/index";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

const { endpoint } = courier();
const visit = new AsyncLocalStorage<{ user: string }>();
const userOf = (): string => visit.getStore()?.user ?? "nobody";

let upstream: Upstream | undefined;

afterEach(async () => {
  await upstream?.close();
  upstream = undefined;
});

/* Takes a user's fresh token alone, and refuses Bob's stale one only once `bobRefused` settles. */
async function usersUpstream(bobRefused: Promise<void>): Promise<string> {
  upstream = await startUpstream((req, res) => {
    const user = String(req.headers["x-user"]);
    if (req.headers.authorization === `Bearer ${user}-fresh`) return sendJson(res, 200, { user });
    if (user !== "bob") return sendJson(res, 401, { message: "token expired" });
    void bobRefused.then(() => sendJson(res, 401, { message: "token expired" }));
  });
  return upstream.url;
}

/* A call made for a user, as a server serving that user's request makes it. */
function callerFor(url: string, refreshToken: () => Promise<string>) {
  const client = createCaller(
    defineApi({
      name: "api",
      baseURL: url,
      middleware: [authMiddleware({ getToken: () => `${userOf()}-stale`, refreshToken })],
      endpoints: { me: endpoint.get("me") },
    }),
  );
  return (user: string) =>
    visit.run({ user }, () => client.with({ headers: { "x-user": user } }).me());
}

/* Each request the upstream got: whose it was, and the token it carried. */
function sent(): Array<[string, string]> {
  return (upstream?.seen ?? []).map((r) => [
    String(r.headers["x-user"]),
    String(r.headers.authorization),
  ]);
}

describe("a token refresh on a server, where each request is a user's", () => {
  it("is not taken by another user's call refused after it ended", async () => {
    let refuseBob: () => void = () => {};
    const url = await usersUpstream(
      new Promise((resolve) => {
        refuseBob = resolve;
      }),
    );
    const refreshToken = vi.fn(async () => `${userOf()}-fresh`);
    const call = callerFor(url, refreshToken);

    const bob = call("bob");
    await expect(call("ana")).resolves.toEqual({ user: "ana" });
    refuseBob();

    await expect(bob).resolves.toEqual({ user: "bob" });
    expect(sent()).not.toContainEqual(["bob", "Bearer ana-fresh"]);
    expect(refreshToken).toHaveBeenCalledTimes(2);
  });

  it("is not joined by another user's call refused while it runs", async () => {
    const url = await usersUpstream(Promise.resolve());
    let bobRefreshing: () => void = () => {};
    const bobStarted = new Promise<void>((resolve) => {
      bobRefreshing = resolve;
    });
    const refreshToken = vi.fn(async () => {
      const user = userOf();
      if (user === "bob") {
        bobRefreshing();
      } else {
        /* Ana's runs until Bob's own has begun, or for a while, should Bob begin none. */
        await Promise.race([bobStarted, new Promise((resolve) => setTimeout(resolve, 500))]);
      }
      return `${user}-fresh`;
    });
    const call = callerFor(url, refreshToken);

    const ana = call("ana");
    await vi.waitFor(() => expect(refreshToken).toHaveBeenCalledOnce());
    const bob = call("bob");

    await expect(Promise.all([ana, bob])).resolves.toEqual([{ user: "ana" }, { user: "bob" }]);
    expect(sent()).not.toContainEqual(["bob", "Bearer ana-fresh"]);
    expect(refreshToken).toHaveBeenCalledTimes(2);
  });
});

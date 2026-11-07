/**
 * `createServerCaller` sets the server part up itself: in a process where
 * nothing else of Courier's server was made or registered, its calls carry
 * the session of the request TanStack Start serves. Its own file, so its
 * process has nothing else in it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createServerCaller } from "../src/react";
import { type Accounts, serveWithStart, startAccounts } from "./helpers/start-app";

let accounts: Accounts;

beforeAll(async () => {
  accounts = await startAccounts();
});

afterAll(async () => {
  await accounts.close();
});

describe("createServerCaller, alone", () => {
  it("sends the session of the request being served", async () => {
    const server = createServerCaller(accounts.api);

    const { value } = await serveWithStart(
      new Request("http://localhost:3000/", { headers: { cookie: "sid=ada" } }),
      () => server.me(),
    );

    expect(value.cookie).toBe("sid=ada");
  });
});

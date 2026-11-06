/**
 * The API import left unfinished goes into the project's database and to
 * every page, one without the project's token too. Studio keeps and sends
 * no address a URL parser reads a user and a password in, however it is
 * spelled — a space or a tab before it, `\\`, one slash or none — whichever
 * page sent it and whatever an older Studio kept; nor a value typed where a
 * variable's name goes. Every value is made up.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Socket } from "socket.io";
import { afterEach, describe, expect, it } from "vitest";

import { keptImportValue } from "../../src/server/kept-import-value";
import { createPageState } from "../../src/server/storage/page-state";
import { openStudioDb } from "../../src/server/storage/studio-db";
import { bindPageState } from "../../src/server/ui-page-state";

/* Each spelling of an address with a user and a password that a URL parser, and so fetch, reads. */
const WITH_CREDENTIALS = [
  "https://ana:pw@api.test/openapi.json",
  "HTTPS://ana:pw@api.test/openapi.json",
  "https://ana%40corp:pw@api.test/openapi.json",
  "https://ana:pw@[::1]:8443/openapi.json",
  " https://ana:pw@api.test/openapi.json",
  "\thttps://ana:pw@api.test/openapi.json",
  "https:/ana:pw@api.test/openapi.json",
  "https:\\\\ana:pw@api.test/openapi.json",
  "https:\\\\deploy:Zq9x-made-up-secret-77@api.example.com/openapi.json",
  "https:ana:pw@api.test/openapi.json",
];
const SECRETS = /:pw@|Zq9x-made-up-secret-77/;

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function pageState() {
  const folder = mkdtempSync(join(tmpdir(), "courier-kept-import-"));
  cleanups.push(() => rmSync(folder, { recursive: true, force: true }));
  const studio = openStudioDb(folder);
  cleanups.push(() => studio.close());
  return { db: studio.db, pages: createPageState(studio.db) };
}

/* A page's socket, as `bindPageState` uses one: what it is sent, and what goes to the other pages. */
function page() {
  const handlers = new Map<string, (raw: unknown) => void>();
  const sent: unknown[] = [];
  const toOthers: unknown[] = [];
  const socket = {
    emit: (_event: string, payload: unknown) => void sent.push(payload),
    on: (event: string, handler: (raw: unknown) => void) => void handlers.set(event, handler),
    broadcast: { emit: (_event: string, payload: unknown) => void toOthers.push(payload) },
  };
  return { socket: socket as unknown as Socket, handlers, sent, toOthers };
}

describe("an address with a user and a password, in the import left unfinished", () => {
  it.each(WITH_CREDENTIALS)("is kept nowhere and sent to no page: %j", (address) => {
    const { db, pages } = pageState();
    const withToken = page();
    bindPageState(withToken.socket, pages, true);

    withToken.handlers.get("page:state:set")?.({
      key: "apis.import",
      value: { source: "url", content: address },
    });
    const withoutToken = page();
    bindPageState(withoutToken.socket, pages, false);

    const stored = db
      .prepare("SELECT value FROM studio_state WHERE key = 'page.apis.import'")
      .get();
    expect(stored?.value).toBe("{}");
    expect(JSON.stringify(withToken.toOthers)).not.toMatch(SECRETS);
    expect(JSON.stringify(withoutToken.sent)).not.toMatch(SECRETS);
  });

  it("an older Studio kept is not sent to a page as it connects", () => {
    const { pages } = pageState();
    pages.write("apis.import", { source: "url", content: WITH_CREDENTIALS[4] });
    const withoutToken = page();

    bindPageState(withoutToken.socket, pages, false);

    expect(withoutToken.sent).toEqual([{ writable: false, state: { "apis.import": {} } }]);
  });
});

describe("the import left unfinished, as Studio keeps it", () => {
  it("keeps an address with no credential, and the auth's names only", () => {
    const content = "https://api.test/openapi.json?page=2";

    expect(
      keptImportValue({
        source: "url",
        content,
        auth: {
          kind: "header",
          token: "made-up-token-5150",
          username: "SPEC_USER",
          password: "",
          headers: [{ name: "X-Api-Key", variable: "k3y-made-up-77" }],
        },
      }),
    ).toEqual({
      source: "url",
      content,
      auth: {
        kind: "header",
        token: "",
        username: "SPEC_USER",
        password: "",
        headers: [{ name: "X-Api-Key", variable: "" }],
      },
    });
    expect(keptImportValue({ source: "raw", content: "openapi: 3.1.0" })).toEqual({
      source: "raw",
      content: "openapi: 3.1.0",
    });
  });
});

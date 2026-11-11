/**
 * A page without the project's token is replayed each log as Studio cut
 * it once, the first time such a page was sent each event: the cut text
 * lies beside the event, only where cutting changed it, and goes with it.
 * Writing an event cuts nothing, so a Studio no such page connects to
 * keeps no second text and spends nothing on one. A page that connects is
 * sent a copy of what was cut, the events of its replay kept since the
 * last such page cut first, a part at a time, so Studio answers everyone
 * else as it cuts — what cutting the whole replay sent, at what a page
 * with the token costs, however long the log.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Socket } from "socket.io";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  guardPageWithoutToken,
  READ_ONLY_PAGES,
  replayToPage,
  shownToPageWithoutToken,
  TOKEN_PAGES,
} from "../../src/server/page-outlet";
import { createRequestLog, MAX_REQUESTS, type RequestLog } from "../../src/server/request-log";
import { createMockLog, MOCK_LOG_REQUESTS, type MockLog } from "../../src/server/storage/mock-log";
import { openStudioDb } from "../../src/server/storage/studio-db";

const cleanups: Array<() => void> = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function studio(): DatabaseSync {
  const dir = mkdtempSync(join(tmpdir(), "courier-replay-without-token-"));
  const opened = openStudioDb(dir);
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  cleanups.push(() => opened.close());
  return opened.db;
}

/* What a call carried that no page without the token may see, all made up. */
const SECRETS = /made-up-password-0041|made-up-otp-7319|made-up-note-token|made-up-answer-token/;
const VARIABLES = {
  email: "ana@example.test",
  password: "made-up-password-0041",
  note: "the link https://app.example/cb?token=made-up-note-token came",
};
const ANSWER = { token: "made-up-answer-token", label: "Order 1042 shipped" };

/* A request the app reported: with what it may not show, or with nothing to cut. */
function request(log: RequestLog, id: string, carries = true): void {
  log.record(
    {
      type: "request:start",
      id,
      source: "api",
      method: "login",
      variables: carries ? VARIABLES : { email: VARIABLES.email },
    },
    "s1",
  );
  log.record(
    {
      type: "request:end",
      requestId: id,
      status: 200,
      data: carries ? ANSWER : { label: ANSWER.label },
    },
    "s1",
  );
}

/* A request a mock answered, as `request` reports one. */
function answered(log: MockLog, id: string, serverId: string, carries = true): void {
  log.record({
    type: "mock:request:start",
    requestId: id,
    serverId,
    path: "/login",
    variables: carries ? VARIABLES : { email: VARIABLES.email },
    requestHeaders: carries
      ? { "x-otp": "made-up-otp-7319", accept: "application/json" }
      : { accept: "application/json" },
  });
  log.record({
    type: "mock:request:end",
    requestId: id,
    serverId,
    status: 200,
    data: carries ? ANSWER : { label: ANSWER.label },
  });
}

/* A request of a log at 16 MB: as large as one, and as much to cut. */
function large(log: RequestLog, id: string): void {
  const records = Array.from({ length: 42 }, (_, n) => ({
    id: `${id}-${n}`,
    name: `Customer ${n}`,
    email: `customer-${n}@example.test`,
    note: `ordered ${n} items, track it at https://shop.example/orders/${n}?ref=mail`,
  }));
  log.record(
    {
      type: "request:start",
      id,
      source: "api",
      method: "orders.list",
      variables: { ...VARIABLES, filter: records.slice(0, 10) },
    },
    "s1",
  );
  log.record(
    { type: "request:end", requestId: id, status: 200, data: { ...ANSWER, records } },
    "s1",
  );
}

/* A request whose answer is as large as a few hundred of those of `large`: a replay of 16 MB holds
   fewer events than a log reads to cut at once. */
function bulky(log: RequestLog, id: string): void {
  const records = Array.from({ length: 2000 }, (_, n) => ({
    id: `${id}-${n}`,
    email: `customer-${n}@example.test`,
    note: `ordered ${n} items, track it at https://shop.example/orders/${n}?ref=mail`,
  }));
  log.record({ type: "request:start", id, source: "api", method: "orders.all" }, "s1");
  log.record(
    { type: "request:end", requestId: id, status: 200, data: { ...ANSWER, records } },
    "s1",
  );
}

const text = (payload: unknown) => new TextDecoder().decode(payload as Uint8Array);

/* What a page without the token was sent of a replay before: the whole one read, each event cut,
   and written again. */
function cutWhole(payload: Uint8Array): string {
  return JSON.stringify(shownToPageWithoutToken("events", JSON.parse(text(payload))));
}

type Replayed = Parameters<typeof replayToPage>[2];

/* A page's socket, and what Studio sends it past the outlet's rules, unless it only counts. */
function pageSocket(token: boolean, keeps = true) {
  const sent: unknown[][] = [];
  const socket = {
    id: token ? "owner" : "reader",
    rooms: new Set([token ? TOKEN_PAGES : READ_ONLY_PAGES]),
    emit: (...args: unknown[]) => (keeps ? sent.push(args) : 0) >= 0,
  } as unknown as Socket;
  if (!token) guardPageWithoutToken(socket);
  return { socket, sent };
}

/* What a page without the token is sent of a log as it connects, once it is sent it. */
async function replayedWithoutToken(log: Replayed, event: "events:replay" | "mock:events:replay") {
  const reader = pageSocket(false);
  await replayToPage(reader.socket, event, log);
  expect(reader.sent.map(([name]) => name)).toEqual([event]);
  return text(reader.sent[0]?.[1]);
}

/* The quickest of a few runs: a pause of the collector in one does not count. */
async function fastest(run: () => Promise<void>): Promise<number> {
  let best = Number.POSITIVE_INFINITY;
  for (let n = 0; n < 5; n++) {
    const started = performance.now();
    await run();
    best = Math.min(best, performance.now() - started);
  }
  return best;
}

/* The longest Studio's main thread went without a turn of the event loop while a run went on. */
async function longestTurn(run: () => Promise<void>): Promise<number> {
  let longest = 0;
  let last = performance.now();
  let going = true;
  const tick = () => {
    const now = performance.now();
    longest = Math.max(longest, now - last);
    last = now;
    if (going) setTimeout(tick, 0);
  };
  setTimeout(tick, 0);
  await run();
  going = false;
  return Math.max(longest, performance.now() - last);
}

describe("the request log, replayed to a page without the token", () => {
  it("is the whole replay cut, as its events are kept, forgotten and pushed out", async () => {
    const log = createRequestLog(studio(), 4000, (id) => id === "r1");
    const same = async () =>
      expect(await replayedWithoutToken(log, "events:replay")).toBe(cutWhole(log.replayPayload()));

    request(log, "r1");
    request(log, "r2", false);
    log.record(
      { type: "stream:open", requestId: "s1", source: "api", method: "feed", variables: VARIABLES },
      "s1",
    );
    log.record(
      { type: "stream:status", requestId: "s1", state: "retrying", note: VARIABLES.note },
      "s1",
    );
    log.record({ type: "stream:status", requestId: "s1", state: "open" }, "s1");
    log.record(
      { type: "stream:message", requestId: "s1", dataPreview: '{"otp":"made-up-otp-7319"}' },
      "s1",
    );
    await same();

    for (let n = 0; n < MAX_REQUESTS; n++) request(log, `n${n}`, n % 2 === 0);
    await same();

    log.forget(new Set(["r1", `n${MAX_REQUESTS - 1}`]));
    await same();
    expect(await replayedWithoutToken(log, "events:replay")).toContain('"r1"');
    expect(await replayedWithoutToken(log, "events:replay")).not.toMatch(SECRETS);
  });

  it("keeps no cut text, and reads no event back, while no page without the token is sent it", () => {
    const db = studio();
    const log = createRequestLog(db);
    request(log, "r1");
    request(log, "r2", false);
    const read = vi.spyOn(JSON, "parse");

    log.replayPayload();

    expect(read).not.toHaveBeenCalled();
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM request_events WHERE shown IS NOT NULL").get()?.n,
    ).toBe(0);
  });

  it("keeps an event once where cutting it changed nothing", async () => {
    const db = studio();
    const log = createRequestLog(db);
    request(log, "r1");
    request(log, "r2", false);
    await replayedWithoutToken(log, "events:replay");

    const kept = db
      .prepare("SELECT request_id, shown <> '' AS cut FROM request_events ORDER BY seq")
      .all()
      .map((row) => [row.request_id, Number(row.cut)]);

    expect(kept).toEqual([
      ["r1", 1],
      ["r1", 1],
      ["r2", 0],
      ["r2", 0],
    ]);
  });

  it("cuts the events a Studio before this one kept, before a page without the token is sent them", async () => {
    const db = studio();
    /* As a Studio before this one kept a request: its events, and nothing beside them. */
    db.prepare("INSERT INTO requests (id, position, open, events) VALUES ('r1', 0, 0, 2)").run();
    const keep = db.prepare("INSERT INTO request_events (request_id, body) VALUES ('r1', ?)");
    keep.run(JSON.stringify({ type: "request:start", id: "r1", variables: VARIABLES }));
    keep.run(JSON.stringify({ type: "request:end", requestId: "r1", status: 200, data: ANSWER }));

    const log = createRequestLog(db);

    expect(await replayedWithoutToken(log, "events:replay")).toBe(cutWhole(log.replayPayload()));
    expect(await replayedWithoutToken(log, "events:replay")).not.toMatch(SECRETS);
  });

  it("cuts each event once: a page connecting again reads only what was kept since", async () => {
    const log = createRequestLog(studio());
    for (let n = 0; n < 20; n++) large(log, `r${n}`);
    await replayedWithoutToken(log, "events:replay");
    for (let n = 20; n < 22; n++) large(log, `r${n}`);
    log.replayPayload();
    const read = vi.spyOn(JSON, "parse");

    const again = await replayedWithoutToken(log, "events:replay");
    const since = read.mock.calls.length;
    read.mockClear();
    const copied = await replayedWithoutToken(log, "events:replay");

    expect(since).toBe(4);
    expect(read).not.toHaveBeenCalled();
    expect(copied).toBe(again);
    expect(copied).not.toMatch(SECRETS);
  });

  it("cuts only what goes in the replay", async () => {
    const db = studio();
    const log = createRequestLog(db, 50_000);
    for (let n = 0; n < 100; n++) large(log, `r${n}`);

    const sent = await replayedWithoutToken(log, "events:replay");

    const cut = db
      .prepare("SELECT COUNT(*) AS n FROM request_events WHERE shown IS NOT NULL")
      .get();
    expect(sent).toBe(cutWhole(log.replayPayload()));
    expect(cut?.n).toBe(JSON.parse(sent).length);
    expect(cut?.n).toBeLessThan(200);
  });

  it("cuts a long log a part at a time, so Studio answers as it cuts", async () => {
    const log = createRequestLog(studio());
    for (let n = 0; n < MAX_REQUESTS; n++) large(log, `r${n}`);
    log.replayPayload();
    const started = performance.now();
    let waited = Number.POSITIVE_INFINITY;
    setTimeout(() => {
      waited = performance.now() - started;
    }, 0);

    const sent = await replayedWithoutToken(log, "events:replay");
    const took = performance.now() - started;

    expect(sent).toBe(cutWhole(log.replayPayload()));
    expect(waited, `the replay took ${took.toFixed(0)} ms`).toBeLessThan(took / 4);
  }, 120_000);

  it("cuts a log of large events a while at a time, however few of them fill the replay", async () => {
    const log = createRequestLog(studio());
    for (let n = 0; n < 100; n++) bulky(log, `r${n}`);
    log.replayPayload();
    const started = performance.now();
    let waited = Number.POSITIVE_INFINITY;
    setTimeout(() => {
      waited = performance.now() - started;
    }, 0);

    const sent = await replayedWithoutToken(log, "events:replay");
    const took = performance.now() - started;

    expect(sent).toBe(cutWhole(log.replayPayload()));
    expect(JSON.parse(sent).length).toBeLessThan(200);
    expect(waited, `the replay took ${took.toFixed(0)} ms`).toBeLessThan(took / 4);
  }, 120_000);

  it("counts the replay's window once for a page without the token, however long its log", async () => {
    const db = studio();
    let windows = 0;
    const prepare = db.prepare.bind(db);
    /* The window's query is the replay's: the requests that fit, counted by the size of each. */
    vi.spyOn(db, "prepare").mockImplementation((sql: string) => {
      const statement = prepare(sql);
      if (!sql.startsWith("WITH sized")) return statement;
      return new Proxy(statement, {
        get: (target, key) => {
          const value: unknown = Reflect.get(target, key);
          if (typeof value !== "function") return value;
          return (...args: unknown[]) => {
            if (key === "all") windows += 1;
            return Reflect.apply(value, target, args);
          };
        },
      });
    });
    const log = createRequestLog(db);
    for (let n = 0; n < MAX_REQUESTS; n++) large(log, `r${n}`);
    log.replayPayload();
    windows = 0;

    const sent = await replayedWithoutToken(log, "events:replay");
    const counted = windows;

    expect(counted).toBe(1);
    expect(sent).toBe(cutWhole(log.replayPayload()));
  }, 120_000);

  it("holds Studio no longer at a time than a page with the token holds it once, at a log of 16 MB", async () => {
    const withToken: number[] = [];
    const withoutToken: number[] = [];
    for (let round = 0; round < 3; round++) {
      const log = createRequestLog(studio());
      for (let n = 0; n < MAX_REQUESTS; n++) large(log, `r${n}`);
      log.replayPayload();

      const started = performance.now();
      await replayToPage(pageSocket(true, false).socket, "events:replay", log);
      withToken.push(performance.now() - started);
      withoutToken.push(
        await longestTurn(() =>
          replayToPage(pageSocket(false, false).socket, "events:replay", log),
        ),
      );
    }

    expect(Math.min(...withoutToken), `a page with the token: ${withToken}`).toBeLessThan(
      Math.min(...withToken),
    );
  }, 180_000);

  it("costs a page without the token what it costs a page with it, at a log of 1.6 MB and of 16 MB", async () => {
    for (const requests of [200, MAX_REQUESTS]) {
      const log = createRequestLog(studio());
      for (let n = 0; n < requests; n++) large(log, `r${n}`);
      const bytes = log.replayPayload().byteLength;
      let added = 0;
      /* Each page connects after new requests came, so the replay it is sent changed since the last. */
      const connects = (token: boolean) => {
        const { socket } = pageSocket(token, false);
        return async () => {
          for (let n = 0; n < 3; n++) large(log, `new${added++}`);
          await replayToPage(socket, "events:replay", log);
        };
      };

      const withToken = await fastest(connects(true));
      const withoutToken = await fastest(connects(false));

      expect(bytes).toBeGreaterThan(requests * 7000);
      expect(withoutToken, `${requests} requests, ${bytes} bytes`).toBeLessThan(withToken * 10);
    }
  }, 120_000);
});

describe("the mocks' log, replayed to a page without the token", () => {
  it("is the whole replay cut, as its events are kept, forgotten and pushed out", async () => {
    const log = createMockLog(studio(), 4000);
    const same = async () =>
      expect(await replayedWithoutToken(log, "mock:events:replay")).toBe(
        cutWhole(log.replayPayload()),
      );

    answered(log, "m1", "shop");
    answered(log, "m2", "petstore", false);
    answered(log, "m3", "petstore");
    await same();

    log.forget("petstore");
    await same();

    for (let n = 0; n < MOCK_LOG_REQUESTS; n++) answered(log, `n${n}`, "shop", n % 2 === 0);
    await same();
    expect(await replayedWithoutToken(log, "mock:events:replay")).not.toMatch(SECRETS);

    log.forgetAll();
    await same();
    expect(await replayedWithoutToken(log, "mock:events:replay")).toBe("[]");
  });

  it("keeps no cut text, and reads no event back, while no page without the token is sent it", () => {
    const db = studio();
    const log = createMockLog(db);
    answered(log, "m1", "shop");
    answered(log, "m2", "shop", false);
    const read = vi.spyOn(JSON, "parse");

    log.replayPayload();

    expect(read).not.toHaveBeenCalled();
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM mock_events WHERE shown IS NOT NULL").get()?.n,
    ).toBe(0);
  });

  it("keeps an event once where cutting it changed nothing", async () => {
    const db = studio();
    const log = createMockLog(db);
    answered(log, "m1", "shop");
    answered(log, "m2", "shop", false);
    await replayedWithoutToken(log, "mock:events:replay");

    const kept = db
      .prepare("SELECT request_id, shown <> '' AS cut FROM mock_events ORDER BY seq")
      .all()
      .map((row) => [row.request_id, Number(row.cut)]);

    expect(kept).toEqual([
      ["m1", 1],
      ["m1", 1],
      ["m2", 0],
      ["m2", 0],
    ]);
  });

  it("cuts only what goes in the replay", async () => {
    const db = studio();
    const log = createMockLog(db, 2_000);
    for (let n = 0; n < 50; n++) answered(log, `m${n}`, "shop");

    const sent = await replayedWithoutToken(log, "mock:events:replay");

    const cut = db.prepare("SELECT COUNT(*) AS n FROM mock_events WHERE shown IS NOT NULL").get();
    expect(sent).toBe(cutWhole(log.replayPayload()));
    expect(cut?.n).toBe(JSON.parse(sent).length);
    expect(cut?.n).toBeLessThan(100);
  });

  it("cuts the events a Studio before this one kept, before a page without the token is sent them", async () => {
    const db = studio();
    /* As a Studio before this one kept a request: its events, and nothing beside them. */
    const keep = db.prepare("INSERT INTO mock_events (request_id, body) VALUES ('m1', ?)");
    keep.run(
      JSON.stringify({
        type: "mock:request:start",
        requestId: "m1",
        serverId: "shop",
        variables: VARIABLES,
      }),
    );
    keep.run(
      JSON.stringify({ type: "mock:request:end", requestId: "m1", serverId: "shop", data: ANSWER }),
    );

    const log = createMockLog(db);

    expect(await replayedWithoutToken(log, "mock:events:replay")).toBe(
      cutWhole(log.replayPayload()),
    );
    expect(await replayedWithoutToken(log, "mock:events:replay")).not.toMatch(SECRETS);
  });
});
